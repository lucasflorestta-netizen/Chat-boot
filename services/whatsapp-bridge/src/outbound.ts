import { supabase, logger, POLL_INTERVAL_MS } from './supabase.js';
import { currentSocket, resolveOutboundJid } from './utils.js';

let processing = false;

/** In-memory retry counts so failed sends don't loop forever. */
const failureCounts = new Map<string, number>();
const MAX_SEND_ATTEMPTS = 5;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mimeFromExtension(fileName: string | null | undefined): string | null {
  if (!fileName || !fileName.includes('.')) return null;
  const ext = fileName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    '3gp': 'video/3gpp',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
    txt: 'text/plain',
    csv: 'text/csv',
  };
  return map[ext] || null;
}

function defaultMimeForType(mediaType: string): string {
  const map: Record<string, string> = {
    image: 'image/jpeg',
    audio: 'audio/ogg',
    video: 'video/mp4',
    sticker: 'image/webp',
    file: 'application/octet-stream',
  };
  return map[mediaType] || 'application/octet-stream';
}

type ContactEmbed = { phone: string; whatsapp_lid?: string | null };
type TicketEmbed = { contacts: ContactEmbed | ContactEmbed[] | null };

function unwrapContact(msgTickets: unknown): ContactEmbed | null {
  // PostgREST may return tickets as object or single-element array
  const ticketRaw = msgTickets as TicketEmbed | TicketEmbed[] | null;
  const ticketData = Array.isArray(ticketRaw) ? ticketRaw[0] : ticketRaw;
  const contacts = ticketData?.contacts;
  if (!contacts) return null;
  return Array.isArray(contacts) ? contacts[0] || null : contacts;
}

async function markDelivered(messageId: string, whatsappMessageId?: string) {
  failureCounts.delete(messageId);
  await supabase.from('messages').update({
    whatsapp_delivered: true,
    ...(whatsappMessageId ? { whatsapp_message_id: whatsappMessageId } : {}),
  }).eq('id', messageId);
}

/** Soft-abandon after too many failures so the poller can move on. */
async function abandonMessage(messageId: string, reason: string) {
  logger.error({ messageId, reason }, 'Abandoning outbound message after max retries');
  failureCounts.delete(messageId);
  // Mark delivered to stop retries; leave whatsapp_message_id null so UI can spot undelivered IDs if needed
  await supabase.from('messages').update({ whatsapp_delivered: true }).eq('id', messageId);
}

type QuotedRow = {
  whatsapp_message_id: string | null;
  sender_type: string;
  body: string | null;
  media_type: string | null;
};

/** Build Baileys `quoted` option from a previously stored message. */
async function buildQuotedOption(
  replyToMessageId: string | null | undefined,
  remoteJid: string,
): Promise<{ key: { remoteJid: string; id: string; fromMe: boolean }; message: { conversation: string } } | undefined> {
  if (!replyToMessageId) return undefined;

  const { data, error } = await supabase
    .from('messages')
    .select('whatsapp_message_id, sender_type, body, media_type')
    .eq('id', replyToMessageId)
    .maybeSingle();

  if (error || !data) {
    if (error) logger.warn({ error, replyToMessageId }, 'Failed to load quoted message');
    return undefined;
  }

  const quoted = data as QuotedRow;
  if (!quoted.whatsapp_message_id) return undefined;

  const preview =
    quoted.body?.trim() ||
    (quoted.media_type === 'image'
      ? 'Foto'
      : quoted.media_type === 'audio'
        ? 'Áudio'
        : quoted.media_type === 'video'
          ? 'Vídeo'
          : quoted.media_type === 'file'
            ? 'Documento'
            : quoted.media_type === 'sticker'
              ? 'Figurinha'
              : 'Mensagem');

  return {
    key: {
      remoteJid,
      id: quoted.whatsapp_message_id,
      fromMe: quoted.sender_type !== 'client',
    },
    message: {
      conversation: preview,
    },
  };
}

export async function processOutboundMessages() {
  if (processing) return;
  if (!currentSocket) return;
  processing = true;

  try {
    const sock = currentSocket;
    const { data: pending, error } = await supabase
      .from('messages')
      .select('id, ticket_id, body, media_type, media_url, media_name, sender_type, reply_to_message_id, tickets(contacts(phone, whatsapp_lid))')
      .eq('whatsapp_delivered', false)
      .in('sender_type', ['agent', 'bot', 'system'])
      .neq('media_type', 'note')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      logger.error({ error }, 'Failed to fetch outbound messages');
      return;
    }

    for (const msg of pending || []) {
      const attempts = failureCounts.get(msg.id) || 0;
      if (attempts >= MAX_SEND_ATTEMPTS) {
        await abandonMessage(msg.id, 'max_attempts');
        continue;
      }

      const contact = unwrapContact(msg.tickets);
      const phone = contact?.phone;
      const lid = contact?.whatsapp_lid || null;
      if (!phone) {
        failureCounts.set(msg.id, attempts + 1);
        logger.warn({ messageId: msg.id }, 'Outbound message missing contact phone — will retry');
        continue;
      }

      let jid: string;
      try {
        jid = await resolveOutboundJid(sock, phone, lid);
      } catch (err) {
        failureCounts.set(msg.id, attempts + 1);
        logger.error({ err, messageId: msg.id, phone, lid }, 'Failed to resolve outbound JID');
        continue;
      }

      try {
        const quoted = await buildQuotedOption(
          (msg as { reply_to_message_id?: string | null }).reply_to_message_id,
          jid,
        );
        const sendOpts = quoted ? { quoted } : undefined;

        if (msg.media_type === 'text' || !msg.media_url) {
          if (msg.body) {
            const result = await sock.sendMessage(jid, { text: msg.body }, sendOpts);
            const waId = result?.key?.id;
            await markDelivered(msg.id, waId || undefined);
          } else {
            await markDelivered(msg.id);
          }
        } else if (msg.media_url) {
          const response = await fetch(msg.media_url);
          if (!response.ok) {
            throw new Error(`Failed to fetch media (${response.status})`);
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          const headerMime = (response.headers.get('content-type') || '').split(';')[0].trim();
          const mimetype =
            (headerMime && headerMime !== 'application/octet-stream' ? headerMime : null) ||
            mimeFromExtension(msg.media_name) ||
            defaultMimeForType(msg.media_type);

          if (msg.media_type === 'image' || msg.media_type === 'sticker') {
            const result = await sock.sendMessage(jid, {
              image: buffer,
              caption: msg.body || undefined,
              mimetype,
            }, sendOpts);
            await markDelivered(msg.id, result?.key?.id || undefined);
          } else if (msg.media_type === 'audio') {
            const result = await sock.sendMessage(jid, {
              audio: buffer,
              mimetype,
              ptt: mimetype.includes('ogg') || mimetype.includes('opus'),
            }, sendOpts);
            await markDelivered(msg.id, result?.key?.id || undefined);
          } else if (msg.media_type === 'video') {
            const result = await sock.sendMessage(jid, {
              video: buffer,
              caption: msg.body || undefined,
              mimetype,
            }, sendOpts);
            await markDelivered(msg.id, result?.key?.id || undefined);
          } else {
            const result = await sock.sendMessage(jid, {
              document: buffer,
              mimetype,
              fileName: msg.media_name || 'file',
              caption: msg.body || undefined,
            }, sendOpts);
            await markDelivered(msg.id, result?.key?.id || undefined);
          }
        }

        await delay(1500 + Math.random() * 1500);
      } catch (err) {
        failureCounts.set(msg.id, attempts + 1);
        logger.error(
          { err, messageId: msg.id, phone, lid, jid, attempts: attempts + 1 },
          'Failed to send outbound message',
        );
      }
    }
  } finally {
    processing = false;
  }
}

export function startOutboundPoller() {
  setInterval(() => {
    processOutboundMessages().catch((err) => logger.error({ err }, 'Outbound poller error'));
  }, POLL_INTERVAL_MS);
}
