import { supabase, logger } from './supabase.js';
import { currentSocket, resolveOutboundJid, getContactByPhone } from './utils.js';

const AVATAR_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const QUEUE_DELAY_MS = 400;

/** Phones already queued or recently fetched this process lifetime. */
const inFlight = new Set<string>();
const lastAttemptAt = new Map<string, number>();
let queue: string[] = [];
let draining = false;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Queue a profile-picture fetch for a contact phone.
 * Downloads the WA CDN image into chat-media so URLs don't expire.
 */
export function enqueueProfilePictureFetch(phone: string, opts?: { force?: boolean }) {
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) return;
  if (inFlight.has(digits)) return;

  const last = lastAttemptAt.get(digits) || 0;
  if (!opts?.force && Date.now() - last < 60_000) return;

  queue.push(digits);
  inFlight.add(digits);
  void drainProfilePictureQueue();
}

async function drainProfilePictureQueue() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const phone = queue.shift()!;
    try {
      await fetchAndStoreProfilePicture(phone);
    } catch (err) {
      logger.warn({ err, phone }, 'Profile picture fetch failed');
    } finally {
      lastAttemptAt.set(phone, Date.now());
      inFlight.delete(phone);
    }
    await delay(QUEUE_DELAY_MS);
  }

  draining = false;
}

async function fetchAndStoreProfilePicture(phone: string): Promise<void> {
  const sock = currentSocket;
  if (!sock) return;

  const contact = await getContactByPhone(phone);
  if (!contact) return;

  // Skip refresh if we already have a fresh avatar URL stored recently
  if (contact.profile_pic_url && contact.updated_at) {
    const updatedAt = new Date(contact.updated_at).getTime();
    if (Date.now() - updatedAt < AVATAR_REFRESH_MS && !contact.profile_pic_url.includes('pps.whatsapp.net')) {
      return;
    }
  }

  const lid = contact.whatsapp_lid || null;
  const jid = await resolveOutboundJid(sock, phone, lid);
  let pictureUrl: string | undefined;
  try {
    pictureUrl = await sock.profilePictureUrl(jid, 'image');
  } catch {
    // Contact has no picture or privacy blocks it — clear stale CDN URLs only
    if (contact.profile_pic_url?.includes('pps.whatsapp.net')) {
      await supabase.from('contacts').update({ profile_pic_url: null }).eq('id', contact.id);
    }
    return;
  }

  if (!pictureUrl) return;

  const response = await fetch(pictureUrl);
  if (!response.ok) {
    logger.warn({ phone, status: response.status }, 'Failed to download profile picture');
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `avatars/${phone}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('chat-media')
    .upload(fileName, buffer, { contentType, upsert: true });

  if (uploadError) {
    logger.warn({ uploadError, phone }, 'Failed to upload profile picture');
    return;
  }

  // Bust cache when re-uploading same path
  const publicUrl = `${supabase.storage.from('chat-media').getPublicUrl(fileName).data.publicUrl}?t=${Date.now()}`;

  await supabase
    .from('contacts')
    .update({ profile_pic_url: publicUrl })
    .eq('id', contact.id);
}
