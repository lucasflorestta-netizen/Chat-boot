import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys';
import { supabase, logger } from './supabase.js';
import {
  getActiveTicket,
  createTicket,
  upsertContact,
  phoneFromJid,
  currentSocket,
} from './utils.js';
import { handleTriageMessage, sendBotGreetingIfNeeded } from './bot/triage.js';
import { handleNpsResponse } from './bot/nps.js';

type MediaKind = 'text' | 'image' | 'audio' | 'video' | 'file' | 'sticker';

function extractText(msg: WAMessage): string | null {
  const message = msg.message;
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    null
  );
}

function extractMediaType(msg: WAMessage): MediaKind {
  const message = msg.message;
  if (!message) return 'text';
  if (message.imageMessage) return 'image';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.stickerMessage) return 'sticker';
  if (message.documentMessage) return 'file';
  return 'text';
}

function extractMimeType(msg: WAMessage): string | null {
  const message = msg.message;
  if (!message) return null;
  return (
    message.imageMessage?.mimetype ||
    message.audioMessage?.mimetype ||
    message.videoMessage?.mimetype ||
    message.stickerMessage?.mimetype ||
    message.documentMessage?.mimetype ||
    null
  );
}

function extractMediaName(msg: WAMessage): string | null {
  return msg.message?.documentMessage?.fileName || null;
}

function extensionFor(mediaType: MediaKind, mime: string | null, fileName: string | null): string {
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  }
  const baseMime = (mime || '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
  };
  if (map[baseMime]) return map[baseMime];
  if (mediaType === 'image' || mediaType === 'sticker') return 'webp';
  if (mediaType === 'audio') return 'ogg';
  if (mediaType === 'video') return 'mp4';
  return 'bin';
}

function contentTypeForUpload(mime: string | null, mediaType: MediaKind): string {
  const baseMime = (mime || '').split(';')[0].trim().toLowerCase();
  if (baseMime) return baseMime;
  if (mediaType === 'image' || mediaType === 'sticker') return 'image/webp';
  if (mediaType === 'audio') return 'audio/ogg';
  if (mediaType === 'video') return 'video/mp4';
  return 'application/octet-stream';
}

async function uploadInboundMedia(
  msg: WAMessage,
  mediaType: MediaKind,
): Promise<{ mediaUrl: string | null; mediaName: string | null }> {
  if (mediaType === 'text') return { mediaUrl: null, mediaName: null };

  const sock = currentSocket;
  if (!sock) {
    logger.warn('Cannot download inbound media: socket not ready');
    return { mediaUrl: null, mediaName: extractMediaName(msg) };
  }

  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;

    const mime = extractMimeType(msg);
    const mediaName = extractMediaName(msg);
    const ext = extensionFor(mediaType, mime, mediaName);
    const fileName = `inbound/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const contentType = contentTypeForUpload(mime, mediaType);

    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(fileName, buffer, { contentType, upsert: false });

    if (uploadError) {
      logger.error({ uploadError, mediaType }, 'Failed to upload inbound media');
      return { mediaUrl: null, mediaName };
    }

    const mediaUrl = supabase.storage.from('chat-media').getPublicUrl(fileName).data.publicUrl;
    return { mediaUrl, mediaName };
  } catch (err) {
    logger.error({ err, mediaType }, 'Failed to download inbound media');
    return { mediaUrl: null, mediaName: extractMediaName(msg) };
  }
}

export async function handleInboundMessage(msg: WAMessage) {
  if (msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us')) return;

  const phone = phoneFromJid(jid);
  const pushName = msg.pushName || 'Unknown';
  const body = extractText(msg);
  const mediaType = extractMediaType(msg);
  const whatsappMessageId = msg.key.id || null;

  const contact = await upsertContact(phone, pushName);
  let ticket = await getActiveTicket(contact.id);

  if (!ticket) {
    ticket = await createTicket(contact.id);
    await sendBotGreetingIfNeeded(ticket.id, phone);
  }

  // NPS response on finished tickets
  if (ticket.status === 'finished' && body) {
    const handled = await handleNpsResponse(ticket.id, contact.id, body.trim());
    if (handled) return;
  }

  if (ticket.status === 'finished') return;

  const { mediaUrl, mediaName } = await uploadInboundMedia(msg, mediaType);

  const { error } = await supabase.from('messages').insert({
    ticket_id: ticket.id,
    sender_type: 'client',
    body,
    media_type: mediaType,
    media_url: mediaUrl,
    media_name: mediaName,
    whatsapp_message_id: whatsappMessageId,
    whatsapp_delivered: true,
  });

  if (error) {
    logger.error({ error }, 'Failed to insert inbound message');
    return;
  }

  const { data: ticketRow } = await supabase.from('tickets').select('unread_count').eq('id', ticket.id).single();
  await supabase.from('tickets').update({
    unread_count: (ticketRow?.unread_count || 0) + 1,
    last_message_at: new Date().toISOString(),
  }).eq('id', ticket.id);

  if (body && ticket.status === 'triage') {
    await handleTriageMessage(ticket.id, phone, body.trim());
  }
}

export async function handleInboundMessages(messages: WAMessage[]) {
  for (const msg of messages) {
    try {
      await handleInboundMessage(msg);
    } catch (err) {
      logger.error({ err }, 'Error processing inbound message');
    }
  }
}
