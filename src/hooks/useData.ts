import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import {
  mapAutoSettings,
  mapCanned,
  mapContact,
  mapMessage,
  mapProfile,
  mapScheduled,
  mapTag,
  mapTicket,
  mapWhatsappStatus,
} from '../lib/mappers';
import type {
  Ticket,
  Message,
  Contact,
  Tag,
  Profile,
  CannedResponse,
  AutoMessageSettings,
  WhatsappConnection,
  NpsRating,
  ScheduledMessage,
} from '../types';

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

export function useTickets(_filter?: { status?: string; department?: string; assignedTo?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    try {
      const data = await api<any[]>('/tickets');
      setTickets((data || []).map(mapTicket));
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    const socket = connectSocket();

    const onCreated = (payload: { ticket: any }) => {
      if (!payload?.ticket) return;
      setTickets((prev) => upsertById(prev, mapTicket(payload.ticket)));
    };
    const onUpdated = (payload: { ticket: any }) => {
      if (!payload?.ticket) return;
      setTickets((prev) => upsertById(prev, mapTicket(payload.ticket)));
    };
    const onMessage = (payload: { ticket?: any; message?: any }) => {
      const rawTicket = payload?.ticket;
      const ticketId = rawTicket?.id ?? payload?.message?.ticketId;
      if (!ticketId) return;

      setTickets((prev) => {
        const idx = prev.findIndex((t) => t.id === ticketId);
        if (idx === -1) {
          if (!rawTicket) return prev;
          return upsertById(prev, mapTicket(rawTicket));
        }

        const existing = prev[idx];
        const mapped = rawTicket ? mapTicket(rawTicket) : existing;
        const merged = {
          ...existing,
          ...mapped,
          contact: existing.contact ?? mapped.contact,
          assigned_agent: existing.assigned_agent ?? mapped.assigned_agent,
          tags: existing.tags?.length ? existing.tags : mapped.tags,
        };
        const next = [...prev];
        next.splice(idx, 1);
        return [merged, ...next];
      });
    };
    const onContact = () => {
      void fetchTickets();
    };

    socket.on('ticket.created', onCreated);
    socket.on('ticket.updated', onUpdated);
    socket.on('ticket_updated', onUpdated);
    socket.on('message.created', onMessage);
    socket.on('new_message', onMessage);
    socket.on('contact.updated', onContact);
    socket.on('user.updated', onContact);

    return () => {
      socket.off('ticket.created', onCreated);
      socket.off('ticket.updated', onUpdated);
      socket.off('ticket_updated', onUpdated);
      socket.off('message.created', onMessage);
      socket.off('new_message', onMessage);
      socket.off('contact.updated', onContact);
      socket.off('user.updated', onContact);
    };
  }, [fetchTickets]);

  return { tickets, loading, refetch: fetchTickets };
}

export function useMessages(ticketId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    setLoading(true);
    setMessages([]);
    api<any>(`/tickets/${ticketId}`)
      .then((ticket) => {
        const msgs = (ticket.messages || []).map(mapMessage);
        setMessages(msgs);
      })
      .catch((err) => console.error('Error fetching messages:', err))
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId) return;
    const socket = connectSocket();
    socket.emit('joinTicket', ticketId);

    const onMessage = (payload: { message?: any; ticket?: any }) => {
      const raw = payload?.message;
      if (!raw) return;
      const ticketMatch = raw.ticketId === ticketId || payload?.ticket?.id === ticketId;
      if (!ticketMatch) return;
      const mapped = mapMessage(raw);
      setMessages((prev) => {
        if (prev.some((m) => m.id === mapped.id)) {
          return prev.map((m) => (m.id === mapped.id ? { ...mapped, _localStatus: undefined } : m));
        }
        const withoutTemp = prev.filter(
          (m) =>
            !(
              m.id.startsWith('temp-') &&
              m.ticket_id === mapped.ticket_id &&
              m.sender_id === mapped.sender_id &&
              m.body === mapped.body &&
              m.media_type === mapped.media_type
            ),
        );
        return [...withoutTemp, mapped];
      });
    };

    socket.on('message.created', onMessage);
    socket.on('new_message', onMessage);

    return () => {
      socket.emit('leaveTicket', ticketId);
      socket.off('message.created', onMessage);
      socket.off('new_message', onMessage);
    };
  }, [ticketId]);

  const appendOptimistic = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const replaceOptimistic = useCallback((tempId: string, message: Message) => {
    setMessages((prev) => {
      const hasTemp = prev.some((m) => m.id === tempId);
      const hasReal = prev.some((m) => m.id === message.id);

      // WS already applied the real message — keep/update it and drop any leftover temp
      if (hasReal) {
        return prev
          .filter((m) => m.id !== tempId)
          .map((m) => (m.id === message.id ? { ...message, _localStatus: undefined } : m));
      }

      // HTTP arrived first — swap temp for the real message
      if (hasTemp) {
        return prev.map((m) => (m.id === tempId ? { ...message, _localStatus: undefined } : m));
      }

      // Neither present (edge case) — append
      return [...prev, { ...message, _localStatus: undefined }];
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

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any[]>('/contacts');
      setContacts((data || []).map(mapContact));
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const socket = connectSocket();
    const onContact = (payload: { contact: any }) => {
      if (!payload?.contact) {
        void refetch();
        return;
      }
      const mapped = mapContact(payload.contact);
      setContacts((prev) => {
        const idx = prev.findIndex((c) => c.id === mapped.id);
        if (idx === -1) return [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name));
        const next = [...prev];
        next[idx] = mapped;
        return next;
      });
    };
    socket.on('contact.updated', onContact);
    return () => {
      socket.off('contact.updated', onContact);
    };
  }, [refetch]);

  return { contacts, loading, refetch };
}

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any[]>('/tags');
      setTags((data || []).map(mapTag));
    } catch (err) {
      console.error('Error fetching tags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  return { tags, loading, refetch };
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any[]>('/users');
      setProfiles((data || []).map(mapProfile));
    } catch (err) {
      console.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const socket = connectSocket();
    const onUser = () => {
      void refetch();
    };
    socket.on('user.updated', onUser);
    return () => {
      socket.off('user.updated', onUser);
    };
  }, [refetch]);

  return { profiles, loading, refetch };
}

export function useCannedResponses() {
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any[]>('/quick-messages');
      setCanned((data || []).map(mapCanned));
    } catch (err) {
      console.error('Error fetching canned responses:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  return { canned, loading, refetch };
}

export function useAutoMessageSettings() {
  const [settings, setSettings] = useState<AutoMessageSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any>('/auto-message-settings');
      setSettings(data ? mapAutoSettings(data) : null);
    } catch (err) {
      console.error('Error fetching auto settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  return { settings, loading, refetch };
}

export function useWhatsappConnection() {
  const [connection, setConnection] = useState<WhatsappConnection | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any>('/whatsapp/status');
      setConnection(mapWhatsappStatus(data));
    } catch (err) {
      console.error('Error fetching whatsapp connection:', err);
      setConnection(mapWhatsappStatus({ status: 'disconnected' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const socket = connectSocket();

    const onQr = (payload: { qr?: string }) => {
      setConnection((prev) =>
        mapWhatsappStatus({
          ...(prev || {}),
          status: 'syncing',
          qr: payload?.qr ?? prev?.qr_code,
          phoneNumber: prev?.phone_number,
          lastConnectedAt: prev?.last_connected_at,
        }),
      );
    };

    const onStatus = (payload: any) => {
      setConnection((prev) =>
        mapWhatsappStatus({
          ...payload,
          qr: payload?.hasQr === false ? null : prev?.qr_code,
        }),
      );
    };

    socket.on('nge-qrcode', onQr);
    socket.on('whatsapp:status', onStatus);

    return () => {
      socket.off('nge-qrcode', onQr);
      socket.off('whatsapp:status', onStatus);
    };
  }, []);

  return { connection, loading, refetch };
}

export function useNpsRatings() {
  const [ratings, setRatings] = useState<NpsRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    total: number;
    average: number | null;
    distribution: Record<number, number>;
  } | null>(null);

  const refetch = useCallback(async () => {
    try {
      const data = await api<{
        total: number;
        average: number | null;
        distribution: Record<number, number>;
        recent: { rating: number | null; createdAt: string }[];
      }>('/dashboard/nps');
      setSummary({
        total: data.total,
        average: data.average,
        distribution: data.distribution,
      });
      setRatings(
        (data.recent || []).map((r, i) => ({
          id: `nps-${i}-${r.createdAt}`,
          ticket_id: '',
          contact_id: '',
          rating: r.rating,
          created_at: r.createdAt,
        })),
      );
    } catch (err) {
      console.error('Error fetching NPS ratings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  return { ratings, loading, refetch, summary };
}

export function useScheduledMessages(ticketId?: string) {
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!ticketId) {
      setScheduled([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api<any[]>(`/tickets/${ticketId}/scheduled`);
      setScheduled((data || []).map(mapScheduled).filter((s) => !s.sent));
    } catch (err) {
      console.error('Error fetching scheduled messages:', err);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    refetch();
  }, [refetch]);
  return { scheduled, loading, refetch };
}

export function useSectors() {
  const [sectors, setSectors] = useState<{ id: string; name: string; triageOption?: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any[]>('/sectors');
      setSectors(data || []);
    } catch (err) {
      console.error('Error fetching sectors:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  return { sectors, loading, refetch };
}

export function ensureSocketConnected() {
  return getSocket() ?? connectSocket();
}
