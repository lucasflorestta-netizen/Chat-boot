import { supabase, logger, POLL_INTERVAL_MS } from './supabase.js';
import { currentSocket, resolveOutboundJid } from './utils.js';

let processing = false;

type ContactEmbed = { phone: string; whatsapp_lid?: string | null };
type TicketEmbed = { contacts: ContactEmbed | ContactEmbed[] | null };

function unwrapContact(msgTickets: unknown): ContactEmbed | null {
  const ticketRaw = msgTickets as TicketEmbed | TicketEmbed[] | null;
  const ticketData = Array.isArray(ticketRaw) ? ticketRaw[0] : ticketRaw;
  const contacts = ticketData?.contacts;
  if (!contacts) return null;
  return Array.isArray(contacts) ? contacts[0] || null : contacts;
}

export async function processScheduledMessages() {
  if (processing) return;
  if (!currentSocket) return;
  processing = true;

  try {
    const sock = currentSocket;
    const now = new Date().toISOString();

    const { data: due, error } = await supabase
      .from('scheduled_messages')
      .select('id, ticket_id, body, tickets(contacts(phone, whatsapp_lid))')
      .eq('sent', false)
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (error) {
      logger.error({ error }, 'Failed to fetch scheduled messages');
      return;
    }

    for (const scheduled of due || []) {
      const contact = unwrapContact(scheduled.tickets);
      const phone = contact?.phone;
      const lid = contact?.whatsapp_lid || null;
      if (!phone || !scheduled.body) {
        await supabase.from('scheduled_messages').update({ sent: true }).eq('id', scheduled.id);
        continue;
      }

      try {
        const jid = await resolveOutboundJid(sock, phone, lid);
        const result = await sock.sendMessage(jid, { text: scheduled.body });

        await supabase.from('messages').insert({
          ticket_id: scheduled.ticket_id,
          sender_type: 'agent',
          body: scheduled.body,
          media_type: 'text',
          whatsapp_delivered: true,
          whatsapp_message_id: result?.key?.id || null,
        });

        await supabase.from('scheduled_messages').update({ sent: true }).eq('id', scheduled.id);
        await supabase.from('tickets').update({ last_message_at: new Date().toISOString() }).eq('id', scheduled.ticket_id);

        logger.info({ scheduledId: scheduled.id, jid }, 'Scheduled message sent');
        await delay(2000);
      } catch (err) {
        logger.error({ err, scheduledId: scheduled.id, phone, lid }, 'Failed to send scheduled message');
      }
    }
  } finally {
    processing = false;
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startScheduler() {
  setInterval(() => {
    processScheduledMessages().catch((err) => logger.error({ err }, 'Scheduler error'));
  }, POLL_INTERVAL_MS);
}
