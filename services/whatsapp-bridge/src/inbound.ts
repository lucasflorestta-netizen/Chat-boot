import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys';
import { supabase, logger } from './supabase.js';
import {
  getActiveTicket,
  getPendingNpsTicket,
  createTicket,
  upsertContact,
  resolveInboundPeer,
  currentSocket,
} from './utils.js';
import { handleTriageMessage, sendBotGreetingIfNeeded } from './bot/triage.js';
import { handleNpsResponse } from './bot/nps.js';
import { enqueueProfilePictureFetch } from './profile-pictures.js';

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

function hasUsableContent(msg: WAMessage): boolean {
  const message = msg.message;
  if (!message) return false;

  // Protocol / stub shells — skip (do not create empty tickets)
  if (message.protocolMessage || message.senderKeyDistributionMessage) return false;

  if (
    message.imageMessage ||
    message.audioMessage ||
    message.videoMessage ||
    message.documentMessage ||
    message.stickerMessage
  ) {
    return true;
  }

  const text = extractText(msg);
  if (text && text.trim()) return true;

  return Boolean(
    message.buttonsResponseMessage ||
      message.listResponseMessage ||
      message.templateButtonReplyMessage,
  );
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

/** Baileys contextInfo attached to text or media payloads. */
function extractContextInfo(msg: WAMessage): {
  stanzaId?: string | null;
  participant?: string | null;
  remoteJid?: string | null;
} | null {
  const message = msg.message;
  if (!message) return null;
  const ctx =
    message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.videoMessage?.contextInfo ||
    message.audioMessage?.contextInfo ||
    message.documentMessage?.contextInfo ||
    message.stickerMessage?.contextInfo ||
    null;
  if (!ctx?.stanzaId) return null;
  return {
    stanzaId: ctx.stanzaId,
    participant: ctx.participant,
    remoteJid: ctx.remoteJid,
  };
}

async function resolveReplyToMessageId(
  ticketId: string,
  stanzaId: string | null | undefined,
): Promise<string | null> {
  if (!stanzaId) return null;
  const { data, error } = await supabase
    .from('messages')
    .select('id')
    .eq('ticket_id', ticketId)
    .eq('whatsapp_message_id', stanzaId)
    .maybeSingle();
  if (error) {
    logger.warn({ error, stanzaId, ticketId }, 'Failed to resolve quoted message');
    return null;
  }
  return data?.id ?? null;
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
    const mediaName =
      extractMediaName(msg) ||
      (mediaType === 'sticker' ? 'sticker.webp' : null);
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

async function messageAlreadyStored(whatsappMessageId: string): Promise<boolean> {
  const { data } = await supabase
    .from('messages')
    .select('id')
    .eq('whatsapp_message_id', whatsappMessageId)
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Messages sent from the linked WhatsApp phone/Web app (fromMe).
 * Persists as agent-side history without triage/unread/bot side effects.
 */
async function handleFromMeMessage(msg: WAMessage) {
  const jid = msg.key.remoteJid!;
  const whatsappMessageId = msg.key.id || null;

  if (whatsappMessageId && (await messageAlreadyStored(whatsappMessageId))) {
    logger.debug({ id: whatsappMessageId }, 'Skipping fromMe echo already stored by outbound');
    return;
  }

  const { phone, lid } = await resolveInboundPeer(msg, currentSocket);
  if (!phone) {
    logger.warn(
      { id: whatsappMessageId, jid, alt: msg.key.remoteJidAlt, lid },
      'Skipping fromMe: could not resolve phone number from LID/PN',
    );
    return;
  }

  const pushName = msg.pushName || 'Unknown';
  const body = extractText(msg);
  const mediaType = extractMediaType(msg);

  if (mediaType === 'text' && !(body && body.trim())) {
    logger.debug({ id: whatsappMessageId }, 'Skipping empty fromMe text message');
    return;
  }

  const contact = await upsertContact(phone, pushName, { whatsappLid: lid });
  enqueueProfilePictureFetch(phone);

  let ticket = await getActiveTicket(contact.id);
  if (!ticket) {
    ticket = await createTicket(contact.id);
  }

  if (ticket.status === 'finished') return;

  const { mediaUrl, mediaName } = await uploadInboundMedia(msg, mediaType);

  if (mediaType !== 'text' && !mediaUrl && !(body && body.trim())) {
    logger.warn({ id: whatsappMessageId, mediaType }, 'Skipping fromMe media without downloaded content');
    return;
  }

  const contextInfo = extractContextInfo(msg);
  const replyToMessageId = await resolveReplyToMessageId(ticket.id, contextInfo?.stanzaId);

  const { error } = await supabase.from('messages').insert({
    ticket_id: ticket.id,
    sender_type: 'agent',
    sender_id: null,
    body,
    media_type: mediaType,
    media_url: mediaUrl,
    media_name: mediaName,
    whatsapp_message_id: whatsappMessageId,
    whatsapp_delivered: true,
    reply_to_message_id: replyToMessageId,
  });

  if (error) {
    logger.error({ error }, 'Failed to insert fromMe message');
    return;
  }

  await supabase
    .from('tickets')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', ticket.id);

  logger.info({ ticketId: ticket.id, id: whatsappMessageId }, 'Synced fromMe WhatsApp message');
}

export async function handleInboundMessage(msg: WAMessage) {
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

  // Skip undecrypted / protocol shells — do not create empty tickets
  if (!hasUsableContent(msg)) {
    logger.debug({ id: msg.key.id, jid }, 'Skipping inbound message without usable payload');
    return;
  }

  if (msg.key.fromMe) {
    await handleFromMeMessage(msg);
    return;
  }

  const { phone, lid } = await resolveInboundPeer(msg, currentSocket);
  if (!phone) {
    logger.warn(
      { id: msg.key.id, jid, alt: msg.key.remoteJidAlt, lid },
      'Skipping inbound: could not resolve phone number from LID/PN',
    );
    return;
  }

  const pushName = msg.pushName || 'Unknown';
  const body = extractText(msg);
  const mediaType = extractMediaType(msg);
  const whatsappMessageId = msg.key.id || null;

  // Avoid inserting empty text-only rows
  if (mediaType === 'text' && !(body && body.trim())) {
    logger.debug({ id: whatsappMessageId }, 'Skipping empty text message');
    return;
  }

  const contact = await upsertContact(phone, pushName, { whatsappLid: lid });
  enqueueProfilePictureFetch(phone);

  let ticket = await getActiveTicket(contact.id);
  let ticketJustCreated = false;

  if (!ticket) {
    // Prefer recording NPS on a recently finished ticket before opening a new one
    if (body) {
      const pendingNpsTicket = await getPendingNpsTicket(contact.id);
      if (pendingNpsTicket && !pendingNpsTicket.bot_paused) {
        const handled = await handleNpsResponse(pendingNpsTicket.id, contact.id, body.trim());
        if (handled) return;
      }
    }

    ticket = await createTicket(contact.id);
    ticketJustCreated = true;
    if (!ticket.bot_paused) {
      await sendBotGreetingIfNeeded(ticket.id, phone, lid);
    }
  }

  if (ticket.status === 'finished') return;

  const { mediaUrl, mediaName } = await uploadInboundMedia(msg, mediaType);

  // If media message failed to download and has no text, skip empty row
  if (mediaType !== 'text' && !mediaUrl && !(body && body.trim())) {
    logger.warn({ id: whatsappMessageId, mediaType }, 'Skipping media message without downloaded content');
    return;
  }

  const contextInfo = extractContextInfo(msg);
  const replyToMessageId = await resolveReplyToMessageId(ticket.id, contextInfo?.stanzaId);

  const { error } = await supabase.from('messages').insert({
    ticket_id: ticket.id,
    sender_type: 'client',
    body,
    media_type: mediaType,
    media_url: mediaUrl,
    media_name: mediaName,
    whatsapp_message_id: whatsappMessageId,
    whatsapp_delivered: true,
    reply_to_message_id: replyToMessageId,
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

  // Skip triage on the opening message (avoids treating "1"/"2" first contact as department pick)
  // and while bot is manually paused on this ticket
  if (body && ticket.status === 'triage' && !ticketJustCreated && !ticket.bot_paused) {
    await handleTriageMessage(ticket.id, phone, body.trim(), lid);
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
