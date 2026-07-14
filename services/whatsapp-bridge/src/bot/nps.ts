import { supabase, logger } from '../supabase.js';

export async function handleNpsResponse(ticketId: string, contactId: string, body: string): Promise<boolean> {
  const rating = parseInt(body, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) return false;

  const { data: nps } = await supabase
    .from('nps_ratings')
    .select('id, rating')
    .eq('ticket_id', ticketId)
    .eq('contact_id', contactId)
    .is('rating', null)
    .maybeSingle();

  if (!nps) return false;

  await supabase.from('nps_ratings').update({ rating }).eq('id', nps.id);

  await supabase.from('messages').insert({
    ticket_id: ticketId,
    sender_type: 'system',
    body: `Obrigado pela sua avaliação (${rating}/5)!`,
    media_type: 'text',
    whatsapp_delivered: false,
  });

  logger.info({ ticketId, rating }, 'NPS rating recorded');
  return true;
}
