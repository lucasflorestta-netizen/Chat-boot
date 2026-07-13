import type { WAMessage } from '@whiskeysockets/baileys';
import { supabase, logger } from './supabase.js';

export async function handleMessageDelete(update: { key: WAMessage['key']; message?: WAMessage['message'] }) {
  const waId = update.key.id;
  if (!waId) return;

  const { data: msg } = await supabase
    .from('messages')
    .select('id, body, original_body')
    .eq('whatsapp_message_id', waId)
    .maybeSingle();

  if (!msg) return;

  await supabase.from('messages').update({
    is_deleted: true,
    original_body: msg.original_body || msg.body,
    body: null,
  }).eq('id', msg.id);

  logger.info({ messageId: msg.id }, 'Message marked as deleted');
}
