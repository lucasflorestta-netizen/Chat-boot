import { supabase, logger, POLL_INTERVAL_MS } from './supabase.js';
import { getSocket, jidFromPhone } from './utils.js';

let processing = false;

export async function processScheduledMessages() {
  if (processing) return;
  processing = true;

  try {
    const sock = getSocket();
    const now = new Date().toISOString();

    const { data: due, error } = await supabase
      .from('scheduled_messages')
      .select('id, ticket_id, body, tickets(contacts(phone))')
      .eq('sent', false)
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (error) {
      logger.error({ error }, 'Failed to fetch scheduled messages');
      return;
    }

    for (const scheduled of due || []) {
      const ticketData = scheduled.tickets as unknown as { contacts: { phone: string } | { phone: string }[] | null } | null;
      const contacts = ticketData?.contacts;
      const phone = Array.isArray(contacts) ? contacts[0]?.phone : contacts?.phone;
      if (!phone || !scheduled.body) {
        await supabase.from('scheduled_messages').update({ sent: true }).eq('id', scheduled.id);
        continue;
      }

      try {
        const jid = jidFromPhone(phone);
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

        logger.info({ scheduledId: scheduled.id }, 'Scheduled message sent');
        await delay(2000);
      } catch (err) {
        logger.error({ err, scheduledId: scheduled.id }, 'Failed to send scheduled message');
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
