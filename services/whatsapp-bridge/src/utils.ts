import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { supabase } from './supabase.js';

let connectionId: string | null = null;

export async function getConnectionId(): Promise<string> {
  if (connectionId) return connectionId;
  const { data } = await supabase.from('whatsapp_connection').select('id').maybeSingle();
  if (!data?.id) throw new Error('whatsapp_connection row not found');
  connectionId = data.id as string;
  return connectionId;
}

export async function updateConnection(fields: Record<string, unknown>) {
  const id = await getConnectionId();
  await supabase.from('whatsapp_connection').update(fields).eq('id', id);
}

export function phoneFromJid(jid: string): string {
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function jidFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

export function jidFromLid(lid: string): string {
  const digits = lid.replace(/\D/g, '');
  return `${digits}@lid`;
}

export function isLidJid(jid: string | undefined | null): jid is string {
  return Boolean(jid && jid.endsWith('@lid'));
}

export function isPnJid(jid: string | undefined | null): jid is string {
  return Boolean(jid && jid.endsWith('@s.whatsapp.net'));
}

export type InboundPeer = {
  phone: string | null;
  lid: string | null;
};

/**
 * Resolve real phone (PN) + LID from an inbound DM.
 * Baileys 7 often delivers remoteJid as @lid with PN on remoteJidAlt.
 */
export async function resolveInboundPeer(msg: WAMessage, sock: WASocket | null): Promise<InboundPeer> {
  const remoteJid = msg.key.remoteJid || null;
  const alt = msg.key.remoteJidAlt || null;
  const mapping = sock?.signalRepository?.lidMapping;

  let phone: string | null = null;
  let lid: string | null = null;

  if (isLidJid(remoteJid)) {
    lid = phoneFromJid(remoteJid);
    if (isPnJid(alt)) {
      phone = phoneFromJid(alt);
    } else if (mapping) {
      const pnJid = await mapping.getPNForLID(remoteJid);
      if (pnJid && isPnJid(pnJid)) phone = phoneFromJid(pnJid);
    }
  } else if (isPnJid(remoteJid)) {
    phone = phoneFromJid(remoteJid);
    if (isLidJid(alt)) {
      lid = phoneFromJid(alt);
    } else if (mapping && phone) {
      const lidJid = await mapping.getLIDForPN(remoteJid);
      if (lidJid && isLidJid(lidJid)) lid = phoneFromJid(lidJid);
    }
  }

  return {
    phone: phone && phone.length >= 8 ? phone : null,
    lid: lid && lid.length >= 8 ? lid : null,
  };
}

/**
 * Prefer LID addressing for outbound (Baileys 7 / avoids error 463).
 * Also detects when contacts.phone was historically stored as LID digits.
 */
export async function resolveOutboundJid(
  sock: WASocket,
  phone: string,
  lid?: string | null,
): Promise<string> {
  const mapping = sock.signalRepository?.lidMapping;
  const phoneDigits = phone.replace(/\D/g, '');
  const lidDigits = lid ? lid.replace(/\D/g, '') : '';

  if (lidDigits) {
    return jidFromLid(lidDigits);
  }

  if (mapping && phoneDigits) {
    // Stored "phone" might actually be a LID from older inbound bugs
    const pnFromLid = await mapping.getPNForLID(jidFromLid(phoneDigits));
    if (pnFromLid && isPnJid(pnFromLid)) {
      return jidFromLid(phoneDigits);
    }

    const mappedLid = await mapping.getLIDForPN(jidFromPhone(phoneDigits));
    if (mappedLid && isLidJid(mappedLid)) {
      return mappedLid.includes(':') ? `${phoneFromJid(mappedLid)}@lid` : mappedLid;
    }
  }

  return jidFromPhone(phoneDigits);
}

export async function getContactByPhone(phone: string) {
  const { data } = await supabase.from('contacts').select('*').eq('phone', phone).maybeSingle();
  return data;
}

export async function getContactByLid(lid: string) {
  const digits = lid.replace(/\D/g, '');
  const { data } = await supabase.from('contacts').select('*').eq('whatsapp_lid', digits).maybeSingle();
  return data;
}

export async function upsertContact(
  phone: string,
  name: string,
  opts?: { preferName?: boolean; profilePicUrl?: string | null; whatsappLid?: string | null },
) {
  const resolvedName = (name || '').trim() || 'Unknown';
  const lidDigits = opts?.whatsappLid ? opts.whatsappLid.replace(/\D/g, '') : null;

  // Prefer lookup by real phone; fall back to lid (repairs contacts that stored LID as phone)
  let existing = await getContactByPhone(phone);
  if (!existing && lidDigits) {
    existing = await getContactByLid(lidDigits);
  }
  // Legacy corruption: LID digits were stored in phone
  if (!existing && lidDigits) {
    existing = await getContactByPhone(lidDigits);
  }

  if (existing) {
    const updates: Record<string, unknown> = {};

    // Repair: phone column held LID digits → replace with real PN
    if (existing.phone !== phone) {
      updates.phone = phone;
    }

    if (lidDigits && existing.whatsapp_lid !== lidDigits) {
      updates.whatsapp_lid = lidDigits;
    }

    const shouldUpdateName =
      resolvedName !== 'Unknown' &&
      (existing.name === 'Unknown' ||
        (opts?.preferName === true && resolvedName !== existing.name));

    if (shouldUpdateName) {
      updates.name = resolvedName;
    }

    if (opts?.profilePicUrl && opts.profilePicUrl !== existing.profile_pic_url) {
      updates.profile_pic_url = opts.profilePicUrl;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('contacts').update(updates).eq('id', existing.id);
      return { ...existing, ...updates };
    }
    return existing;
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      phone,
      name: resolvedName,
      ...(lidDigits ? { whatsapp_lid: lidDigits } : {}),
      ...(opts?.profilePicUrl ? { profile_pic_url: opts.profilePicUrl } : {}),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getActiveTicket(contactId: string) {
  const { data } = await supabase
    .from('tickets')
    .select('*')
    .eq('contact_id', contactId)
    .neq('status', 'finished')
    .order('created_at', { ascending: false })
    .maybeSingle();
  return data;
}

export async function createTicket(contactId: string, department = 'support') {
  const { data, error } = await supabase
    .from('tickets')
    .insert({ contact_id: contactId, status: 'triage', department })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type BridgeSocket = WASocket | null;
export let currentSocket: BridgeSocket = null;

export function setSocket(sock: WASocket | null) {
  currentSocket = sock;
}

export function getSocket(): WASocket {
  if (!currentSocket) throw new Error('WhatsApp socket not connected');
  return currentSocket;
}
