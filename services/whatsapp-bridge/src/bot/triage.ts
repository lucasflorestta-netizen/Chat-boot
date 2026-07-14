import { supabase, logger } from '../supabase.js';
import { getSocket, resolveOutboundJid } from '../utils.js';

const QUEUE_ACK =
  'Recebemos sua solicitação. Em breve um agente dará continuidade ao atendimento.';

async function insertOutboundMessage(ticketId: string, body: string, senderType: 'bot' | 'system' = 'bot') {
  await supabase.from('messages').insert({
    ticket_id: ticketId,
    sender_type: senderType,
    body,
    media_type: 'text',
    whatsapp_delivered: true,
  });
}

export async function sendWhatsAppText(phone: string, text: string, lid?: string | null): Promise<void> {
  const sock = getSocket();
  const jid = await resolveOutboundJid(sock, phone, lid);
  await sock.sendMessage(jid, { text });
  await delay(1500);
}

export async function sendBotGreetingIfNeeded(ticketId: string, phone: string, lid?: string | null) {
  const { data: settings } = await supabase.from('auto_message_settings').select('*').maybeSingle();
  if (!settings) return;

  const greeting = settings.greeting_message || 'Olá! Bem-vindo ao nosso atendimento.';
  await sendWhatsAppText(phone, greeting, lid);
  await insertOutboundMessage(ticketId, greeting, 'bot');

  if (settings.bot_menu_active) {
    const menu = settings.bot_menu_message || 'Digite 1 para Suporte ou 2 para Comercial.';
    await sendWhatsAppText(phone, menu, lid);
    await insertOutboundMessage(ticketId, menu, 'bot');
  }
}

export async function handleTriageMessage(ticketId: string, phone: string, body: string, lid?: string | null) {
  const { data: settings } = await supabase.from('auto_message_settings').select('bot_menu_active').maybeSingle();
  if (!settings?.bot_menu_active) return;

  let department: string | null = null;
  if (body === '1') department = 'support';
  else if (body === '2') department = 'sales';
  else return;

  await supabase.from('tickets').update({ department }).eq('id', ticketId);

  await sendWhatsAppText(phone, QUEUE_ACK, lid);
  await insertOutboundMessage(ticketId, QUEUE_ACK, 'system');

  logger.info({ ticketId, department }, 'Ticket triaged via bot');
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
