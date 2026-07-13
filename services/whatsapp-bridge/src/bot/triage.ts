import { supabase, logger } from '../supabase.js';
import { getSocket, jidFromPhone } from '../utils.js';

async function insertOutboundMessage(ticketId: string, body: string, senderType: 'bot' | 'system' = 'bot') {
  await supabase.from('messages').insert({
    ticket_id: ticketId,
    sender_type: senderType,
    body,
    media_type: 'text',
    whatsapp_delivered: true,
  });
}

export async function sendWhatsAppText(phone: string, text: string): Promise<void> {
  const sock = getSocket();
  const jid = jidFromPhone(phone);
  await sock.sendMessage(jid, { text });
  await delay(1500);
}

export async function sendBotGreetingIfNeeded(ticketId: string, phone: string) {
  const { data: settings } = await supabase.from('auto_message_settings').select('*').maybeSingle();
  if (!settings) return;

  const greeting = settings.greeting_message || 'Olá! Bem-vindo ao nosso atendimento.';
  await sendWhatsAppText(phone, greeting);
  await insertOutboundMessage(ticketId, greeting, 'bot');

  if (settings.bot_menu_active) {
    const menu = settings.bot_menu_message || 'Digite 1 para Suporte ou 2 para Comercial.';
    await sendWhatsAppText(phone, menu);
    await insertOutboundMessage(ticketId, menu, 'bot');
  }
}

export async function handleTriageMessage(ticketId: string, phone: string, body: string) {
  const { data: settings } = await supabase.from('auto_message_settings').select('bot_menu_active').maybeSingle();
  if (!settings?.bot_menu_active) return;

  let department: string | null = null;
  if (body === '1') department = 'support';
  else if (body === '2') department = 'sales';
  else return;

  await supabase.from('tickets').update({ department }).eq('id', ticketId);

  const { data: settingsFull } = await supabase.from('auto_message_settings').select('takeover_message').maybeSingle();
  const takeover = settingsFull?.takeover_message || 'Um agente irá atendê-lo em breve.';
  await sendWhatsAppText(phone, takeover);
  await insertOutboundMessage(ticketId, takeover, 'system');

  logger.info({ ticketId, department }, 'Ticket triaged via bot');
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
