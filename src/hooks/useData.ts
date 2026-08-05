import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import {
  mapAutoSettings,
  mapAppearanceSettings,
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
  AppearanceSettings,
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

const FINISHED_PAGE_SIZE = 80;

type TicketsPage = {
  items: any[];
  hasMore: boolean;
  nextOffset: number | null;
};

type TicketsStoreState = {
  tickets: Ticket[];
  loading: boolean;
  loadingMore: boolean;
  hasMoreFinished: boolean;
};

/** Store único: App + ChatView compartilham o mesmo estado/socket (sem listeners duplicados). */
const ticketsListeners = new Set<() => void>();
let ticketsStore: TicketsStoreState = {
  tickets: [],
  loading: true,
  loadingMore: false,
  hasMoreFinished: false,
};
let finishedOffset = 0;
let ticketsSocketBound = false;
let ticketsFetchPromise: Promise<void> | null = null;

function emitTicketsStore() {
  for (const listener of ticketsListeners) listener();
}

function patchTicketsStore(partial: Partial<TicketsStoreState>) {
  ticketsStore = { ...ticketsStore, ...partial };
  emitTicketsStore();
}

function setTicketsList(next: Ticket[]) {
  patchTicketsStore({ tickets: next });
}

/**
 * Atualiza a lista local com o ticket da API (assign/finish/etc).
 * Evita depender só do WebSocket para a aba Meus / Triagem refletir na hora.
 */
export function upsertTicketFromApi(raw: unknown): Ticket | null {
  if (!raw || typeof raw !== 'object' || !('id' in raw) || !(raw as { id?: unknown }).id) {
    return null;
  }
  const mapped = mapTicket(raw);
  setTicketsList(upsertById(ticketsStore.tickets, mapped));
  return mapped;
}

function parseTicketsResponse(data: unknown): TicketsPage {
  if (Array.isArray(data)) {
    return { items: data, hasMore: false, nextOffset: null };
  }
  if (data && typeof data === 'object' && Array.isArray((data as TicketsPage).items)) {
    const page = data as TicketsPage;
    return {
      items: page.items,
      hasMore: Boolean(page.hasMore),
      nextOffset: page.nextOffset ?? null,
    };
  }
  return { items: [], hasMore: false, nextOffset: null };
}

function mergeTicketsById(existing: Ticket[], incoming: Ticket[]): Ticket[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const ticket of incoming) {
    byId.set(ticket.id, ticket);
  }
  return [...byId.values()];
}

function mergeMessageIntoTicket(
  existing: Ticket,
  rawTicket: any | undefined,
  rawMessage: any | undefined,
): Ticket {
  const mapped = rawTicket ? mapTicket(rawTicket) : existing;
  const mappedMsg = rawMessage ? mapMessage(rawMessage) : null;
  const fromEvent = mappedMsg
    ? {
        id: mappedMsg.id,
        body: mappedMsg.body,
        media_type: mappedMsg.media_type,
        sender_type: mappedMsg.sender_type,
        created_at: mappedMsg.created_at,
        deleted_by_client: mappedMsg.deleted_by_client,
        deleted_for_client: mappedMsg.deleted_for_client,
      }
    : null;
  return {
    ...existing,
    ...mapped,
    contact: mapped.contact
      ? {
          ...existing.contact,
          ...mapped.contact,
          // Mantém o relógio do WA alinhado à última msg (ordem Tudo).
          wa_conversation_at:
            fromEvent?.created_at ??
            mapped.contact.wa_conversation_at ??
            existing.contact?.wa_conversation_at ??
            null,
        }
      : existing.contact,
    assigned_agent: mapped.assigned_agent ?? existing.assigned_agent,
    pending_transfer_to_agent:
      mapped.pending_transfer_to_agent ?? existing.pending_transfer_to_agent,
    pending_transfer_from_agent:
      mapped.pending_transfer_from_agent ?? existing.pending_transfer_from_agent,
    tags: mapped.tags?.length ? mapped.tags : existing.tags,
    last_message: mapped.last_message ?? fromEvent ?? existing.last_message,
    last_message_at:
      fromEvent?.created_at ?? mapped.last_message_at ?? existing.last_message_at,
  };
}

async function fetchTicketsStore() {
  if (ticketsFetchPromise) return ticketsFetchPromise;
  ticketsFetchPromise = (async () => {
    try {
      // 1) Abertos (conjunto pequeno) — operação não depende de histórico fechado.
      // 2) Finalizados paginados + dedupe no servidor (1 card por contato).
      const [openRaw, finishedRaw] = await Promise.all([
        api<unknown>('/tickets?inbox=abertos'),
        api<unknown>(
          `/tickets?inbox=finalizados&contactDedupe=true&limit=${FINISHED_PAGE_SIZE}&offset=0`,
        ),
      ]);
      const openPage = parseTicketsResponse(openRaw);
      const finishedPage = parseTicketsResponse(finishedRaw);
      const mapped = mergeTicketsById(
        (openPage.items || []).map(mapTicket),
        (finishedPage.items || []).map(mapTicket),
      );
      finishedOffset = finishedPage.nextOffset ?? finishedPage.items.length;
      patchTicketsStore({
        tickets: mapped,
        hasMoreFinished: finishedPage.hasMore,
        loading: false,
      });
    } catch (err) {
      console.error('Error fetching tickets:', err);
      patchTicketsStore({ loading: false });
    } finally {
      ticketsFetchPromise = null;
    }
  })();
  return ticketsFetchPromise;
}

async function loadMoreFinishedStore() {
  if (ticketsStore.loadingMore || !ticketsStore.hasMoreFinished) return;
  patchTicketsStore({ loadingMore: true });
  try {
    const offset = finishedOffset;
    const raw = await api<unknown>(
      `/tickets?inbox=finalizados&contactDedupe=true&limit=${FINISHED_PAGE_SIZE}&offset=${offset}`,
    );
    const page = parseTicketsResponse(raw);
    const mapped = (page.items || []).map(mapTicket);
    const next = mergeTicketsById(ticketsStore.tickets, mapped);
    finishedOffset = page.nextOffset ?? offset + mapped.length;
    patchTicketsStore({
      tickets: next,
      hasMoreFinished: page.hasMore,
      loadingMore: false,
    });
  } catch (err) {
    console.error('Error loading more finished tickets:', err);
    patchTicketsStore({ loadingMore: false });
  }
}

function bindTicketsSocket() {
  if (ticketsSocketBound) return;
  ticketsSocketBound = true;
  const socket = connectSocket();

  const onCreated = (payload: { ticket: any }) => {
    if (!payload?.ticket) return;
    setTicketsList(upsertById(ticketsStore.tickets, mapTicket(payload.ticket)));
  };
  const onUpdated = (payload: { ticket: any }) => {
    if (!payload?.ticket) return;
    setTicketsList(upsertById(ticketsStore.tickets, mapTicket(payload.ticket)));
  };
  const onMessage = (payload: { ticket?: any; message?: any }) => {
    const rawTicket = payload?.ticket;
    const ticketId = rawTicket?.id ?? payload?.message?.ticketId;
    if (!ticketId) return;

    const prev = ticketsStore.tickets;
    const idx = prev.findIndex((t) => t.id === ticketId);
    if (idx === -1) {
      if (!rawTicket) return;
      setTicketsList(upsertById(prev, mapTicket(rawTicket)));
      return;
    }

    // Atualiza no lugar: a UI reordena por activityAt (com freeze no clique).
    const next = [...prev];
    next[idx] = mergeMessageIntoTicket(prev[idx], rawTicket, payload?.message);
    setTicketsList(next);
  };
  const onContact = (payload?: { contact?: any }) => {
    // Sem contact no payload: não refetch (user.updated / payloads vazios geravam thrash).
    if (!payload?.contact) return;
    const mapped = mapContact(payload.contact);
    setTicketsList(
      ticketsStore.tickets.map((t) => {
        if (t.contact_id !== mapped.id && t.contact?.id !== mapped.id) {
          return t;
        }
        return {
          ...t,
          contact: {
            ...(t.contact ?? {
              id: mapped.id,
              name: mapped.name,
              phone: mapped.phone,
              whatsapp_lid: mapped.whatsapp_lid,
              profile_pic_url: null,
              notes: null,
              wa_conversation_at: null,
              wa_archived: false,
              created_at: mapped.created_at,
              updated_at: mapped.updated_at,
            }),
            ...mapped,
          },
        };
      }),
    );
  };

  socket.on('ticket.created', onCreated);
  socket.on('ticket.updated', onUpdated);
  socket.on('ticket_updated', onUpdated);
  socket.on('ticket.transfer.requested', onUpdated);
  socket.on('ticket.transfer.accepted', onUpdated);
  socket.on('ticket.transfer.rejected', onUpdated);
  socket.on('ticket.transfer.cancelled', onUpdated);
  socket.on('message.created', onMessage);
  socket.on('new_message', onMessage);
  socket.on('contact.updated', onContact);
}

export function useTickets(_filter?: { status?: string; department?: string; assignedTo?: string }) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const onChange = () => setVersion((v) => v + 1);
    const becameFirstSubscriber = ticketsListeners.size === 0;
    ticketsListeners.add(onChange);
    bindTicketsSocket();
    // Primeiro subscriber (ex.: login) ou lista vazia → fetch; demais compartilham o store.
    if (becameFirstSubscriber || ticketsStore.tickets.length === 0) {
      void fetchTicketsStore();
    }
    return () => {
      ticketsListeners.delete(onChange);
      // Logout / unmount total: limpa cache para o próximo login não ver tickets alheios.
      if (ticketsListeners.size === 0) {
        ticketsStore = {
          tickets: [],
          loading: true,
          loadingMore: false,
          hasMoreFinished: false,
        };
        finishedOffset = 0;
        ticketsFetchPromise = null;
      }
    };
  }, []);

  const loadMoreFinished = useCallback(() => {
    void loadMoreFinishedStore();
  }, []);

  const refetch = useCallback(() => {
    void fetchTicketsStore();
  }, []);

  return {
    tickets: ticketsStore.tickets,
    loading: ticketsStore.loading,
    loadingMore: ticketsStore.loadingMore,
    hasMoreFinished: ticketsStore.hasMoreFinished,
    loadMoreFinished,
    refetch,
  };
}

export function useMessages(ticketId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticketId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    api<any>(`/tickets/${ticketId}`)
      .then((ticket) => {
        if (cancelled) return;
        const msgs = (ticket.messages || []).map(mapMessage);
        setMessages(msgs);
      })
      .catch((err) => {
        if (!cancelled) console.error('Error fetching messages:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

    const onMessageUpdated = (payload: { message?: any; ticket?: any }) => {
      const raw = payload?.message;
      if (!raw) return;
      const ticketMatch = raw.ticketId === ticketId || payload?.ticket?.id === ticketId;
      if (!ticketMatch) return;
      const mapped = mapMessage(raw);
      setMessages((prev) =>
        prev.map((m) => (m.id === mapped.id ? { ...mapped, _localStatus: m._localStatus } : m)),
      );
    };
    socket.on('message.updated', onMessageUpdated);

    return () => {
      socket.emit('leaveTicket', ticketId);
      socket.off('message.created', onMessage);
      socket.off('new_message', onMessage);
      socket.off('message.updated', onMessageUpdated);
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

  const updateMessage = useCallback((message: Message) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...message, _localStatus: undefined } : m)),
    );
  }, []);

  return {
    messages,
    loading,
    appendOptimistic,
    replaceOptimistic,
    failOptimistic,
    removeOptimistic,
    updateMessage,
  };
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const sortByName = useCallback((list: Contact[]) => {
    return [...list].sort((a, b) =>
      (a.name || a.phone || '').localeCompare(b.name || b.phone || '', 'pt-BR', {
        sensitivity: 'base',
      }),
    );
  }, []);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any[]>('/contacts');
      setContacts(sortByName((data || []).map(mapContact)));
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [sortByName]);

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
        if (idx === -1) return sortByName([...prev, mapped]);
        const next = [...prev];
        next[idx] = mapped;
        return sortByName(next);
      });
    };
    const onDeleted = (payload: { id?: string }) => {
      if (!payload?.id) {
        void refetch();
        return;
      }
      setContacts((prev) => prev.filter((c) => c.id !== payload.id));
    };
    socket.on('contact.updated', onContact);
    socket.on('contact.deleted', onDeleted);
    return () => {
      socket.off('contact.updated', onContact);
      socket.off('contact.deleted', onDeleted);
    };
  }, [refetch, sortByName]);

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

export function useAppearanceSettings() {
  const [settings, setSettings] = useState<AppearanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const data = await api<any>('/appearance-settings');
      setSettings(data ? mapAppearanceSettings(data) : null);
    } catch (err) {
      console.error('Error fetching appearance settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(
    async (payload: { wallpaperKey: string; customImageUrl?: string | null }) => {
      setSaving(true);
      try {
        const data = await api<any>('/appearance-settings', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const mapped = mapAppearanceSettings(data);
        setSettings(mapped);
        return mapped;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const socket = getSocket() ?? connectSocket();
    const onUpdated = (payload: { settings?: unknown }) => {
      if (payload?.settings) {
        setSettings(mapAppearanceSettings(payload.settings));
      } else {
        void refetch();
      }
    };
    socket.on('appearance.updated', onUpdated);
    return () => {
      socket.off('appearance.updated', onUpdated);
    };
  }, [refetch]);

  return { settings, loading, saving, refetch, update };
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

  const markSyncing = useCallback(() => {
    setConnection((prev) =>
      mapWhatsappStatus({
        status: 'syncing',
        qr: prev?.qr_code ?? null,
        phoneNumber: prev?.phone_number ?? null,
        lastConnectedAt: prev?.last_connected_at ?? null,
        hasQr: !!prev?.qr_code,
      }),
    );
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
          qr: payload?.hasQr === false ? null : (payload?.qr ?? prev?.qr_code),
        }),
      );
    };

    socket.on('cc-qrcode', onQr);
    socket.on('whatsapp:status', onStatus);

    return () => {
      socket.off('cc-qrcode', onQr);
      socket.off('whatsapp:status', onStatus);
    };
  }, []);

  return { connection, loading, refetch, markSyncing };
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
