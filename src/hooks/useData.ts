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
const MESSAGE_SELECT =
  '*, sender:profiles!messages_sender_id_fkey(*), reply_to:messages!reply_to_message_id(*)';

async function fetchEnrichedMessage(id: string): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('Error enriching message:', error);
    return null;
  }
  return data as Message | null;
}

export function useMessages(ticketId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    setLoading(true);
    setMessages([]);
    supabase
      .from('messages')
      .select(MESSAGE_SELECT)
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
          const row = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) {
              return prev.map((m) => (m.id === row.id ? { ...m, ...row, _localStatus: undefined } : m));
            }
            // Drop matching optimistic temp rows (same body/media from this agent send)
            const withoutTemp = prev.filter(
              (m) => !(m.id.startsWith('temp-') && m.ticket_id === row.ticket_id && m.sender_id === row.sender_id
                && m.body === row.body && m.media_type === row.media_type && m.media_url === row.media_url),
            );
            return [...withoutTemp, row];
          });
          void fetchEnrichedMessage(row.id).then((enriched) => {
            if (!enriched) return;
            setMessages((prev) =>
              prev.map((m) => (m.id === enriched.id ? { ...enriched, _localStatus: undefined } : m)),
            );
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== row.id) return m;
              return {
                ...m,
                ...row,
                sender: m.sender,
                reply_to: m.reply_to,
                _localStatus: undefined,
              };
            }),
          );
          void fetchEnrichedMessage(row.id).then((enriched) => {
            if (!enriched) return;
            setMessages((prev) => prev.map((m) => (m.id === enriched.id ? enriched : m)));
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId]);

  const appendOptimistic = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const replaceOptimistic = useCallback((tempId: string, message: Message) => {
    setMessages((prev) => {
      const withoutDup = prev.filter((m) => m.id !== message.id);
      return withoutDup.map((m) => (m.id === tempId ? { ...message, _localStatus: undefined } : m));
    });
  }, []);

  const failOptimistic = useCallback((tempId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, _localStatus: 'failed' as const } : m)),
    );
  }, []);

  const removeOptimistic = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  return {
    messages,
    loading,
    appendOptimistic,
    replaceOptimistic,
    failOptimistic,
    removeOptimistic,
  };
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
