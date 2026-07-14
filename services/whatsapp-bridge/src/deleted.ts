import type { WAMessage } from '@whiskeysockets/baileys';
import { logger } from './supabase.js';

/**
 * WhatsApp revoke/delete events are intentionally ignored.
 * Messages stay intact in the CRM so agents keep full conversation history.
 */
export async function handleMessageDelete(update: { key: WAMessage['key']; message?: WAMessage['message'] }) {
  const waId = update.key.id;
  if (!waId) return;
  logger.debug({ waId }, 'Ignoring WhatsApp message revoke — CRM history preserved');
}
