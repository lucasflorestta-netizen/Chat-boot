import type { WASocket } from '@whiskeysockets/baileys';
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

export async function getContactByPhone(phone: string) {
  const { data } = await supabase.from('contacts').select('*').eq('phone', phone).maybeSingle();
  return data;
}

export async function upsertContact(
  phone: string,
  name: string,
  opts?: { preferName?: boolean },
) {
  const resolvedName = (name || '').trim() || 'Unknown';
  const existing = await getContactByPhone(phone);
  if (existing) {
    const shouldUpdate =
      resolvedName !== 'Unknown' &&
      (existing.name === 'Unknown' ||
        (opts?.preferName === true && resolvedName !== existing.name));

    if (shouldUpdate) {
      await supabase.from('contacts').update({ name: resolvedName }).eq('id', existing.id);
      return { ...existing, name: resolvedName };
    }
    return existing;
  }
  const { data, error } = await supabase
    .from('contacts')
    .insert({ phone, name: resolvedName })
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
