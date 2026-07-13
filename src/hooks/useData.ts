import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Ticket, Message, Contact, Tag, Profile, CannedResponse, AutoMessageSettings, WhatsappConnection, NpsRating, ScheduledMessage } from '../types';

// ============================================================
// TICKETS
// ============================================================
export function useTickets(filter?: { status?: string; department?: string; assignedTo?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    let query = supabase
      .from('tickets')
      .select('*, contact:contacts(*), assigned_agent:profiles!tickets_assigned_to_fkey(*), tags:ticket_tags(tag:tags(*))')
      .order('last_message_at', { ascending: false });

    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.department) query = query.eq('department', filter.department);
    if (filter?.assignedTo) query = query.eq('assigned_to', filter.assignedTo);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching tickets:', error);
      return;
    }
    const mapped = (data || []).map((t: any) => ({
      ...t,
      tags: t.tags?.map((tt: any) => tt.tag).filter(Boolean) ?? [],
    }));
    setTickets(mapped as Ticket[]);
    setLoading(false);
  }, [filter?.status, filter?.department, filter?.assignedTo]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    const channel = supabase
      .channel('tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTickets]);

  return { tickets, loading, refetch: fetchTickets };
}

// ============================================================
// MESSAGES
// ============================================================
export function useMessages(ticketId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    setLoading(true);
    supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('Error fetching messages:', error);
        setMessages((data || []) as Message[]);
        setLoading(false);
      });
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`messages-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new as Message : m)));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId]);

  return { messages, loading };
}

// ============================================================
// CONTACTS
// ============================================================
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('contacts').select('*').order('name', { ascending: true });
    if (error) console.error('Error fetching contacts:', error);
    setContacts((data || []) as Contact[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    const channel = supabase
      .channel('contacts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  return { contacts, loading, refetch };
}

// ============================================================
// TAGS
// ============================================================
export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('tags').select('*').order('name');
    if (error) console.error('Error fetching tags:', error);
    setTags((data || []) as Tag[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { tags, loading, refetch };
}

// ============================================================
// PROFILES (users)
// ============================================================
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) console.error('Error fetching profiles:', error);
    setProfiles((data || []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { profiles, loading, refetch };
}

// ============================================================
// CANNED RESPONSES
// ============================================================
export function useCannedResponses() {
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('canned_responses').select('*').order('shortcut');
    if (error) console.error('Error fetching canned responses:', error);
    setCanned((data || []) as CannedResponse[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { canned, loading, refetch };
}

// ============================================================
// AUTO MESSAGE SETTINGS
// ============================================================
export function useAutoMessageSettings() {
  const [settings, setSettings] = useState<AutoMessageSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('auto_message_settings').select('*').maybeSingle();
    if (error) console.error('Error fetching auto settings:', error);
    setSettings(data as AutoMessageSettings | null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { settings, loading, refetch };
}

// ============================================================
// WHATSAPP CONNECTION
// ============================================================
export function useWhatsappConnection() {
  const [connection, setConnection] = useState<WhatsappConnection | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('whatsapp_connection').select('*').maybeSingle();
    if (error) console.error('Error fetching whatsapp connection:', error);
    setConnection(data as WhatsappConnection | null);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-connection-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_connection' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  return { connection, loading, refetch };
}

// ============================================================
// NPS RATINGS
// ============================================================
export function useNpsRatings() {
  const [ratings, setRatings] = useState<NpsRating[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.from('nps_ratings').select('*').order('created_at', { ascending: false });
    if (error) console.error('Error fetching NPS ratings:', error);
    setRatings((data || []) as NpsRating[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { ratings, loading, refetch };
}

// ============================================================
// SCHEDULED MESSAGES
// ============================================================
export function useScheduledMessages(ticketId?: string) {
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    let query = supabase.from('scheduled_messages').select('*').eq('sent', false).order('scheduled_for');
    if (ticketId) query = query.eq('ticket_id', ticketId);
    const { data, error } = await query;
    if (error) console.error('Error fetching scheduled messages:', error);
    setScheduled((data || []) as ScheduledMessage[]);
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { scheduled, loading, refetch };
}
