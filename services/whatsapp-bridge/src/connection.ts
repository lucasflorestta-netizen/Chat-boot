import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { initAuthState, resetAuthStateCache } from './session-storage.js';
import { supabase, logger } from './supabase.js';
import { handleInboundMessages } from './inbound.js';
import { handleMessageDelete } from './deleted.js';
import { setSocket, updateConnection, getConnectionId } from './utils.js';
import { startOutboundPoller } from './outbound.js';
import { startScheduler } from './scheduler.js';
import {
  clearContactCache,
  flushContactCache,
  syncBaileysContacts,
} from './contacts-sync.js';

let sock: WASocket | null = null;
let connecting = false;
let shouldReconnect = true;
let clearSessionFn: (() => Promise<void>) | null = null;
let applyingOwnUpdate = false;
let lastContactsSyncRequestedAt: string | null = null;
let contactSyncRestartInFlight = false;
let consecutiveClosedCount = 0;

export async function startConnectionManager() {
  startOutboundPoller();
  startScheduler();

  const { data: conn } = await supabase.from('whatsapp_connection').select('*').maybeSingle();
  lastContactsSyncRequestedAt =
    (conn as { contacts_sync_requested_at?: string | null } | null)?.contacts_sync_requested_at ?? null;
  if (conn?.status === 'connected' || conn?.status === 'syncing') {
    await connectSocket();
  }

  supabase
    .channel('whatsapp-connection-control')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_connection' }, async (payload) => {
      if (applyingOwnUpdate) return;

      const row = payload.new as {
        status: string;
        qr_code: string | null;
        contacts_sync_requested_at?: string | null;
      };
      logger.info({ status: row.status, hasQr: Boolean(row.qr_code) }, 'Connection status changed');

      if (
        row.contacts_sync_requested_at &&
        row.contacts_sync_requested_at !== lastContactsSyncRequestedAt
      ) {
        lastContactsSyncRequestedAt = row.contacts_sync_requested_at;
        if (sock || connecting) {
          logger.info('Contacts sync requested from UI — flushing cache and restarting for history/app-state sync');
          await flushContactCache();
          await restartSocketForContactSync();
        }
      }

      if (row.status === 'syncing') {
        shouldReconnect = true;
        // Frontend clears qr_code to request a fresh pairing session.
        if (row.qr_code == null && (sock || connecting)) {
          await restartSocketForQr();
        } else if (!sock && !connecting) {
          await connectSocket();
        }
      } else if (row.status === 'disconnected') {
        shouldReconnect = false;
        await disconnectSocket(true);
      }
    })
    .subscribe();

  logger.info('WhatsApp bridge connection manager started');
}

async function writeConnection(fields: Record<string, unknown>) {
  applyingOwnUpdate = true;
  try {
    await updateConnection(fields);
  } finally {
    // Allow Realtime echo to settle before accepting external updates again
    setTimeout(() => {
      applyingOwnUpdate = false;
    }, 750);
  }
}

async function restartSocketForQr() {
  logger.info('Restarting socket to request a new QR code');
  shouldReconnect = false;
  const previous = sock;
  sock = null;
  setSocket(null);
  connecting = false;
  if (previous) {
    try {
      previous.end(undefined);
    } catch {
      // ignore teardown errors
    }
  }
  await delay(800);
  shouldReconnect = true;
  await connectSocket();
}

/** Soft-restart so Baileys re-runs history + app-state sync (address book contactActions). */
async function restartSocketForContactSync() {
  if (contactSyncRestartInFlight) return;
  contactSyncRestartInFlight = true;
  try {
    logger.info('Restarting socket to re-sync WhatsApp contacts');
    shouldReconnect = false;
    const previous = sock;
    sock = null;
    setSocket(null);
    connecting = false;
    if (previous) {
      try {
        previous.end(undefined);
      } catch {
        // ignore teardown errors
      }
    }
    await delay(800);
    shouldReconnect = true;
    await connectSocket();
  } finally {
    contactSyncRestartInFlight = false;
  }
}

async function connectSocket() {
  if (connecting || sock) return;
  connecting = true;

  try {
    const { state, saveCreds, clearSession } = await initAuthState();
    clearSessionFn = clearSession;

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      // Chrome/Ubuntu avoids the Desktop+DARWIN payload that WhatsApp rejects with 428
      // before QR. Keep syncFullHistory for address-book / history contact sync.
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      // Required: without this, Baileys skips history AND the initial app-state sync
      // that delivers address-book contacts via contactAction → contacts.upsert.
      syncFullHistory: true,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrcode.generate(qr, { small: true });
        await writeConnection({ qr_code: qr, status: 'syncing' });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const restartRequired = statusCode === DisconnectReason.restartRequired;
        const replaced = statusCode === DisconnectReason.connectionReplaced;

        logger.warn({ statusCode, loggedOut, restartRequired, replaced }, 'Connection closed');
        setSocket(null);
        sock = null;
        connecting = false;

        if (loggedOut) {
          consecutiveClosedCount = 0;
          await clearSession();
          resetAuthStateCache();
          clearSessionFn = null;
          clearContactCache();
          shouldReconnect = false;
          await writeConnection({
            status: 'disconnected',
            qr_code: null,
            phone_number: null,
          });
        } else if (shouldReconnect) {
          const connectionClosed = statusCode === DisconnectReason.connectionClosed;
          if (connectionClosed) {
            consecutiveClosedCount += 1;
          } else {
            consecutiveClosedCount = 0;
          }

          // Broken/partial credentials produce a 428 loop — wipe session and wait for a new QR.
          if (connectionClosed && consecutiveClosedCount >= 4) {
            logger.warn('Too many connectionClosed errors — clearing session for re-pairing');
            consecutiveClosedCount = 0;
            await clearSession();
            resetAuthStateCache();
            clearSessionFn = null;
            clearContactCache();
            shouldReconnect = false;
            await writeConnection({
              status: 'disconnected',
              qr_code: null,
              phone_number: null,
            });
            return;
          }

          // 515 after QR pair is normal. 440 means another session stole the socket.
          const waitMs = restartRequired ? 1500 : replaced ? 15000 : connectionClosed ? 8000 : 3000;
          await delay(waitMs);
          await connectSocket();
        }
      } else if (connection === 'open') {
        consecutiveClosedCount = 0;
        const phone = sock?.user?.id ? sock.user.id.split(':')[0] : null;
        await writeConnection({
          status: 'connected',
          qr_code: null,
          phone_number: phone ? `+${phone}` : null,
          last_connected_at: new Date().toISOString(),
        });
        setSocket(sock);
        connecting = false;
        logger.info({ phone }, 'WhatsApp connected — waiting for contact sync events');
      }
    });

    sock.ev.on('contacts.upsert', async (contacts) => {
      try {
        await syncBaileysContacts(contacts);
      } catch (err) {
        logger.error({ err }, 'contacts.upsert sync failed');
      }
    });

    sock.ev.on('contacts.update', async (updates) => {
      try {
        await syncBaileysContacts(updates);
      } catch (err) {
        logger.error({ err }, 'contacts.update sync failed');
      }
    });

    sock.ev.on('messaging-history.set', async ({ contacts }) => {
      if (!contacts?.length) return;
      try {
        await syncBaileysContacts(contacts);
      } catch (err) {
        logger.error({ err }, 'messaging-history.set contact sync failed');
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      await handleInboundMessages(messages);
    });

    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (update.update?.messageStubType === 1 || update.update?.message === null) {
          await handleMessageDelete(update as Parameters<typeof handleMessageDelete>[0]);
        }
      }
    });
  } catch (err) {
    logger.error({ err }, 'Failed to connect socket');
    connecting = false;
    setSocket(null);
    sock = null;
    await writeConnection({ status: 'disconnected', qr_code: null });
  }
}

async function disconnectSocket(clearSession = false) {
  shouldReconnect = false;
  if (sock) {
    try {
      await sock.logout();
    } catch {
      try {
        sock.end(undefined);
      } catch {
        // ignore
      }
    }
  }
  sock = null;
  setSocket(null);
  connecting = false;

  if (clearSession && clearSessionFn) {
    await clearSessionFn();
    resetAuthStateCache();
    clearSessionFn = null;
    clearContactCache();
  }

  await writeConnection({
    status: 'disconnected',
    qr_code: null,
    phone_number: null,
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function ensureConnectionRow() {
  await getConnectionId();
}
