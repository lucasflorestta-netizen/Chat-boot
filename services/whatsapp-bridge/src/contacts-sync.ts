import type { Contact as BaileysContact } from '@whiskeysockets/baileys';
import { logger } from './supabase.js';
import { phoneFromJid, upsertContact } from './utils.js';

type CachedContact = {
  phone: string;
  name: string;
  preferName: boolean;
};

/** In-memory cache of contacts seen from Baileys (for re-flush on Sincronizar). */
const contactCache = new Map<string, CachedContact>();

function isUserJid(jid: string | undefined | null): jid is string {
  return Boolean(jid && jid.endsWith('@s.whatsapp.net'));
}

function resolvePhone(contact: Partial<BaileysContact>): string | null {
  // Baileys 7: phone may be on phoneNumber; id can be @lid or @s.whatsapp.net
  const candidates = [contact.phoneNumber, contact.id].filter(Boolean) as string[];
  for (const jid of candidates) {
    if (isUserJid(jid)) {
      const phone = phoneFromJid(jid);
      if (phone && phone.length >= 8) return phone;
    }
  }
  return null;
}

function resolveName(contact: Partial<BaileysContact>): { name: string; preferName: boolean } {
  const saved = contact.name?.trim();
  if (saved) return { name: saved, preferName: true };

  const notify = contact.notify?.trim();
  if (notify) return { name: notify, preferName: false };

  const verified = contact.verifiedName?.trim();
  if (verified) return { name: verified, preferName: false };

  return { name: 'Unknown', preferName: false };
}

function cacheContact(phone: string, name: string, preferName: boolean) {
  const existing = contactCache.get(phone);
  if (!existing) {
    contactCache.set(phone, { phone, name, preferName });
    return;
  }
  // Prefer saved WA names over notify/push names in cache
  if (preferName || (!existing.preferName && name !== 'Unknown')) {
    contactCache.set(phone, { phone, name, preferName: preferName || existing.preferName });
  } else if (existing.name === 'Unknown' && name !== 'Unknown') {
    contactCache.set(phone, { phone, name, preferName });
  }
}

/**
 * Upsert a batch of Baileys contacts into Supabase `contacts`.
 * Returns how many contacts were processed (valid user JIDs).
 */
export async function syncBaileysContacts(contacts: Array<Partial<BaileysContact>>): Promise<number> {
  let processed = 0;

  for (const contact of contacts) {
    const phone = resolvePhone(contact);
    if (!phone) continue;

    const { name, preferName } = resolveName(contact);
    cacheContact(phone, name, preferName);

    try {
      await upsertContact(phone, name, { preferName });
      processed += 1;
    } catch (err) {
      logger.warn({ err, phone }, 'Failed to upsert synced contact');
    }
  }

  if (processed > 0) {
    logger.info({ processed, cached: contactCache.size }, 'Contacts synced from WhatsApp');
  }

  return processed;
}

/** Re-write all cached contacts to Supabase (used when UI requests sync). */
export async function flushContactCache(): Promise<number> {
  if (contactCache.size === 0) {
    logger.info('Contact sync requested but cache is empty (waiting for WhatsApp contact events)');
    return 0;
  }

  let processed = 0;
  for (const entry of contactCache.values()) {
    try {
      await upsertContact(entry.phone, entry.name, { preferName: entry.preferName });
      processed += 1;
    } catch (err) {
      logger.warn({ err, phone: entry.phone }, 'Failed to flush cached contact');
    }
  }

  logger.info({ processed, cached: contactCache.size }, 'Flushed contact cache to database');
  return processed;
}

export function clearContactCache() {
  contactCache.clear();
}

export function getCachedContactCount() {
  return contactCache.size;
}
