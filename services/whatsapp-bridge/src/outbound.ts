import { supabase, logger, POLL_INTERVAL_MS } from './supabase.js';
import { currentSocket, jidFromPhone } from './utils.js';

let processing = false;

export async function processOutboundMessages() {
  if (processing) return;
  if (!currentSocket) return;
  processing = true;

  try {
    const sock = currentSocket;
    const { data: pending, error } = await supabase
      .from('messages')
      .select('id, ticket_id, body, media_type, media_url, media_name, sender_type, tickets(contacts(phone))')
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
      const ticketData = msg.tickets as unknown as { contacts: { phone: string } | { phone: string }[] | null } | null;
      const contacts = ticketData?.contacts;
      const phone = Array.isArray(contacts) ? contacts[0]?.phone : contacts?.phone;
      if (!phone) {
        await markDelivered(msg.id);
        continue;
      }

      const jid = jidFromPhone(phone);

      try {
        if (msg.media_type === 'text' || !msg.media_url) {
          if (msg.body) {
            const result = await sock.sendMessage(jid, { text: msg.body });
            const waId = result?.key?.id;
            await markDelivered(msg.id, waId || undefined);
          } else {
            await markDelivered(msg.id);
          }
        } else if (msg.media_url) {
          const response = await fetch(msg.media_url);
          const buffer = Buffer.from(await response.arrayBuffer());
          const mimeMap: Record<string, string> = {
            image: 'image/jpeg',
            audio: 'audio/mpeg',
            video: 'video/mp4',
            file: 'application/octet-stream',
          };
          const mimetype = mimeMap[msg.media_type] || 'application/octet-stream';

          if (msg.media_type === 'image') {
            const result = await sock.sendMessage(jid, { image: buffer, caption: msg.body || undefined, mimetype });
            await markDelivered(msg.id, result?.key?.id || undefined);
          } else if (msg.media_type === 'audio') {
            const result = await sock.sendMessage(jid, { audio: buffer, mimetype, ptt: true });
            await markDelivered(msg.id, result?.key?.id || undefined);
          } else if (msg.media_type === 'video') {
            const result = await sock.sendMessage(jid, { video: buffer, caption: msg.body || undefined, mimetype });
            await markDelivered(msg.id, result?.key?.id || undefined);
          } else {
            const result = await sock.sendMessage(jid, {
              document: buffer,
              mimetype,
              fileName: msg.media_name || 'file',
            });
            await markDelivered(msg.id, result?.key?.id || undefined);
          }
        }

        await delay(1500 + Math.random() * 1500);
      } catch (err) {
        logger.error({ err, messageId: msg.id }, 'Failed to send outbound message');
      }
    }
  } finally {
    processing = false;
  }
}

async function markDelivered(messageId: string, whatsappMessageId?: string) {
  await supabase.from('messages').update({
    whatsapp_delivered: true,
    ...(whatsappMessageId ? { whatsapp_message_id: whatsappMessageId } : {}),
  }).eq('id', messageId);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startOutboundPoller() {
  setInterval(() => {
    processOutboundMessages().catch((err) => logger.error({ err }, 'Outbound poller error'));
  }, POLL_INTERVAL_MS);
}
