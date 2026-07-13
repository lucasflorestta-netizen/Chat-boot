import fs from 'fs';
import path from 'path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { supabase, SESSION_BUCKET, SESSION_PREFIX, logger } from './supabase.js';

const AUTH_DIR = path.resolve('./data/auth');

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
    const content = fs.readFileSync(path.join(AUTH_DIR, file));
    await supabase.storage.from(SESSION_BUCKET).upload(
      `${SESSION_PREFIX}/${file}`,
      content,
      { upsert: true, contentType: 'application/octet-stream' }
    );
  }
}

export async function initAuthState() {
  await downloadSessionFromStorage();
  const { state, saveCreds: originalSave } = await useMultiFileAuthState(AUTH_DIR);

  const saveCreds = async () => {
    await originalSave();
    await uploadSessionToStorage();
  };

  const clearSession = async () => {
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
