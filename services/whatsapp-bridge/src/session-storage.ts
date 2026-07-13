import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { supabase, SESSION_BUCKET, SESSION_PREFIX, logger } from './supabase.js';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/auth');

async function downloadSessionFromStorage(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { data: files, error } = await supabase.storage.from(SESSION_BUCKET).list(SESSION_PREFIX);
  if (error) {
    logger.warn({ error }, 'Could not list session files from storage');
    return;
  }
  for (const file of files || []) {
    const remotePath = `${SESSION_PREFIX}/${file.name}`;
    const { data, error: dlError } = await supabase.storage.from(SESSION_BUCKET).download(remotePath);
    if (dlError || !data) continue;
    const localPath = path.join(AUTH_DIR, file.name);
    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
  }
}

async function uploadSessionToStorage(): Promise<void> {
  if (!fs.existsSync(AUTH_DIR)) return;
  const files = fs.readdirSync(AUTH_DIR);
  for (const file of files) {
    const localPath = path.join(AUTH_DIR, file);
    let content: Buffer;
    try {
      content = fs.readFileSync(localPath);
    } catch (err) {
      // Baileys may rotate/delete keys while we upload; skip missing files.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    const { error } = await supabase.storage.from(SESSION_BUCKET).upload(
      `${SESSION_PREFIX}/${file}`,
      content,
      { upsert: true, contentType: 'application/octet-stream' }
    );
    if (error) logger.warn({ error, file }, 'Failed to upload session file');
  }
}

function hasLocalCreds(): boolean {
  return fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
}

let authPromise: ReturnType<typeof createAuthState> | null = null;

async function createAuthState() {
  // Only hydrate from remote when explicitly enabled and there is no local session.
  // A stale/partial remote snapshot causes Connection Closed (428) loops and never
  // reaches a usable QR — prefer a clean local pair unless restore is requested.
  const restoreRemote = process.env.WHATSAPP_RESTORE_SESSION === '1';
  if (!hasLocalCreds() && restoreRemote) {
    logger.info('Restoring WhatsApp session from remote storage');
    await downloadSessionFromStorage();
  } else if (hasLocalCreds()) {
    logger.info('Using existing local WhatsApp session');
  } else {
    logger.info('Starting fresh WhatsApp auth (no local session)');
  }

  const { state, saveCreds: originalSave } = await useMultiFileAuthState(AUTH_DIR);

  const saveCreds = async () => {
    await originalSave();
    try {
      await uploadSessionToStorage();
    } catch (err) {
      logger.warn({ err }, 'Failed to upload session to storage');
    }
  };

  const clearSession = async () => {
    authPromise = null;
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    const { data: files } = await supabase.storage.from(SESSION_BUCKET).list(SESSION_PREFIX);
    if (files?.length) {
      await supabase.storage.from(SESSION_BUCKET).remove(
        files.map((f) => `${SESSION_PREFIX}/${f.name}`)
      );
    }
  };

  return { state, saveCreds, clearSession };
}

export async function initAuthState() {
  if (!authPromise) {
    authPromise = createAuthState();
  }
  return authPromise;
}

export function resetAuthStateCache() {
  authPromise = null;
}
