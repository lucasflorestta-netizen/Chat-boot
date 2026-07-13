import type { WAMessage } from '@whiskeysockets/baileys';
import { supabase, logger } from './supabase.js';
import {
  getActiveTicket,
  createTicket,
  upsertContact,
  phoneFromJid,
} from './utils.js';
import { handleTriageMessage, sendBotGreetingIfNeeded } from './bot/triage.js';
import { handleNpsResponse } from './bot/nps.js';

function extractText(msg: WAMessage): string | null {
  const message = msg.message;
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    null
  );
}

function extractMediaType(msg: WAMessage): 'text' | 'image' | 'audio' | 'video' | 'file' | 'sticker' {
  const message = msg.message;
  if (!message) return 'text';
  if (message.imageMessage) return 'image';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.stickerMessage) return 'sticker';
  if (message.documentMessage) return 'file';
  return 'text';
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

  const { error } = await supabase.from('messages').insert({
    ticket_id: ticket.id,
    sender_type: 'client',
    body,
    media_type: mediaType,
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
