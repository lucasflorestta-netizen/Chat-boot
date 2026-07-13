import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { initAuthState } from './session-storage.js';
import { supabase, logger } from './supabase.js';
import { handleInboundMessages } from './inbound.js';
import { handleMessageDelete } from './deleted.js';
import { setSocket, updateConnection, getConnectionId } from './utils.js';
import { startOutboundPoller } from './outbound.js';
import { startScheduler } from './scheduler.js';

let sock: WASocket | null = null;
let connecting = false;
let shouldReconnect = true;
let clearSessionFn: (() => Promise<void>) | null = null;

export async function startConnectionManager() {
  startOutboundPoller();
  startScheduler();

  const { data: conn } = await supabase.from('whatsapp_connection').select('*').maybeSingle();
  if (conn?.status === 'connected' || conn?.status === 'syncing') {
    await connectSocket();
  }

  supabase
    .channel('whatsapp-connection-control')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_connection' }, async (payload) => {
      const row = payload.new as { status: string };
      logger.info({ status: row.status }, 'Connection status changed');

      if (row.status === 'syncing' && !sock && !connecting) {
        shouldReconnect = true;
        await connectSocket();
      } else if (row.status === 'disconnected') {
        shouldReconnect = false;
        await disconnectSocket(true);
      }
    })
    .subscribe();

  logger.info('WhatsApp bridge connection manager started');
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
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrcode.generate(qr, { small: true });
        await updateConnection({ qr_code: qr, status: 'syncing' });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        logger.warn({ statusCode, loggedOut }, 'Connection closed');
        setSocket(null);
        sock = null;
        connecting = false;

        if (loggedOut) {
          await clearSession();
          await updateConnection({
            status: 'disconnected',
            qr_code: null,
            phone_number: null,
          });
          shouldReconnect = false;
        } else if (shouldReconnect) {
          await delay(3000);
          await connectSocket();
        }
      } else if (connection === 'open') {
        const phone = sock?.user?.id ? sock.user.id.split(':')[0] : null;
        await updateConnection({
          status: 'connected',
          qr_code: null,
          phone_number: phone ? `+${phone}` : null,
          last_connected_at: new Date().toISOString(),
        });
        setSocket(sock);
        connecting = false;
        logger.info({ phone }, 'WhatsApp connected');
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
    await updateConnection({ status: 'disconnected', qr_code: null });
  }
}

async function disconnectSocket(clearSession = false) {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      sock.end(undefined);
    }
  }
  sock = null;
  setSocket(null);
  connecting = false;

  if (clearSession && clearSessionFn) {
    await clearSessionFn();
  }

  await updateConnection({
    status: 'disconnected',
    qr_code: null,
    phone_number: null,
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Ensure connection row exists on startup
export async function ensureConnectionRow() {
  await getConnectionId();
}
