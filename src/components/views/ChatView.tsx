import { useEffect, useMemo, useRef, useState } from 'react';
import { useTickets, useTags, useAppearanceSettings, useContacts } from '../../hooks/useData';
import { api } from '../../lib/api';
import { mapTicket } from '../../lib/mappers';
import { useAuth } from '../../context/useAuth';
import type { Ticket } from '../../types';
import { resolveWallpaper } from '../../lib/chatWallpapers';
import { ChatDetail } from '../chat/ChatDetail';
import { ConversationListItem } from '../chat/ConversationListItem';
import {
  Search,
  Tag as TagIcon,
  UserCog,
  X,
  CheckCircle,
  MessageSquare,
  Inbox,
  CircleDot,
} from 'lucide-react';

interface ChatViewProps {
  preselectedTicketId?: string | null;
  onConsumePreselect?: () => void;
  onSelectedTicketChange?: (ticketId: string | null) => void;
}

type TabFilter = 'all' | 'triage' | 'attending' | 'finished' | 'mine';

/** Relógio do WA Web; fallback CRM. */
function activityAt(t: Ticket): number {
  const wa = t.contact?.wa_conversation_at
    ? new Date(t.contact.wa_conversation_at).getTime()
    : 0;
  if (wa > 0) return wa;
  const fromField = new Date(t.last_message_at).getTime();
  const fromMsg = t.last_message?.created_at
    ? new Date(t.last_message.created_at).getTime()
    : 0;
  return Math.max(fromField, fromMsg || 0);
}

/** Uma conversa por contato (estilo WA Tudo):
 * - Ordena pelo conversationTimestamp do WhatsApp.
 * - Preferir ticket aberto para abrir no CRM; preview do mais recente. */
function dedupeByContact(tickets: Ticket[]): Ticket[] {
  type Acc = {
    display: Ticket;
    sortAt: number;
    preview: Ticket;
    previewAt: number;
  };
  const best = new Map<string, Acc>();

  for (const ticket of tickets) {
    if (ticket.contact?.wa_archived) continue;

    const key = ticket.contact_id || ticket.id;
    const sortCandidate = activityAt(ticket);
    const previewAt = new Date(ticket.last_message_at).getTime();
    const existing = best.get(key);

    if (!existing) {
      best.set(key, {
        display: ticket,
        sortAt: sortCandidate,
        preview: ticket,
        previewAt,
      });
      continue;
    }

    const sortAt = Math.max(existing.sortAt, sortCandidate);
    const preview = previewAt > existing.previewAt ? ticket : existing.preview;
    const nextPreviewAt = Math.max(existing.previewAt, previewAt);

    const existingOpen = existing.display.status !== 'finished';
    const ticketOpen = ticket.status !== 'finished';

    let display = existing.display;
    if (ticketOpen && !existingOpen) {
      display = ticket;
    } else if (
      ticketOpen === existingOpen &&
      previewAt > new Date(existing.display.last_message_at).getTime()
    ) {
      display = ticket;
    }

    best.set(key, {
      display,
      sortAt,
      preview,
      previewAt: nextPreviewAt,
    });
  }

  return [...best.values()]
    .sort((a, b) => b.sortAt - a.sortAt)
    .map(({ display, preview }) => ({
      ...display,
      last_message: preview.last_message ?? display.last_message,
    }));
}

function sortByLastMessage(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => activityAt(b) - activityAt(a));
}

export function ChatView({ preselectedTicketId, onConsumePreselect, onSelectedTicketChange }: ChatViewProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canEditWallpaper = profile?.apiRole === 'ADMIN';
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('all');

  const { tickets, loading } = useTickets();
  const { contacts } = useContacts();
  const { tags, refetch: refetchTags } = useTags();
  const { settings: appearance, saving: wallpaperSaving, update: updateAppearance } =
    useAppearanceSettings();
  const photoRefreshAttempted = useRef<Set<string>>(new Set());

  /** Mesma fonte de foto/nome da Agenda de Contatos. */
  const ticketsWithAgenda = useMemo(() => {
    if (!contacts.length) return tickets;
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return tickets.map((t) => {
      const agenda = byId.get(t.contact_id) ?? (t.contact?.id ? byId.get(t.contact.id) : undefined);
      if (!agenda) return t;
      return {
        ...t,
        contact: {
          ...(t.contact ?? agenda),
          ...agenda,
          // Preferir foto da agenda; manter a do ticket se agenda ainda não tiver.
          profile_pic_url: agenda.profile_pic_url || t.contact?.profile_pic_url || null,
          name: agenda.name || t.contact?.name || 'Contato',
        },
      };
    });
  }, [tickets, contacts]);

  useEffect(() => {
    if (!isAdmin && (tab === 'all' || tab === 'attending' || tab === 'finished')) {
      setTab('triage');
    }
  }, [isAdmin, tab]);

  const wallpaperKey = appearance?.wallpaperKey ?? 'linen';
  const customImageUrl = appearance?.customImageUrl ?? null;
  const wallpaper = resolveWallpaper(wallpaperKey, customImageUrl);

  const handleWallpaperChange = (id: string) => {
    if (!canEditWallpaper) return;
    void updateAppearance({ wallpaperKey: id, customImageUrl: null });
  };

  const handleCustomWallpaper = (url: string) => {
    if (!canEditWallpaper) return;
    void updateAppearance({ wallpaperKey: 'custom', customImageUrl: url });
  };

  const deptFiltered = useMemo(() => {
    if (isAdmin) return ticketsWithAgenda;
    return ticketsWithAgenda.filter(
      (t) =>
        t.status === 'triage' ||
        (profile?.sectorIds?.length
          ? profile.sectorIds.includes(t.sectorId ?? '')
          : profile?.sectorId != null && t.sectorId === profile.sectorId) ||
        t.assigned_to === profile?.id ||
        t.pending_transfer_to === profile?.id,
    );
  }, [ticketsWithAgenda, profile, isAdmin]);

  /** Lista principal estilo WA Tudo — 1 contato, todos os status. */
  const todosList = useMemo(() => dedupeByContact(deptFiltered), [deptFiltered]);

  /** Clientes aguardando atendimento (sem responsável). */
  const triageTickets = useMemo(
    () =>
      sortByLastMessage(
        deptFiltered.filter((t) => t.status === 'triage' && !t.assigned_to),
      ),
    [deptFiltered],
  );

  const tabFiltered = useMemo(() => {
    switch (tab) {
      case 'triage':
        return triageTickets;
      case 'attending':
        return sortByLastMessage(
          deptFiltered.filter((t) => t.status === 'attending'),
        );
      case 'finished':
        return sortByLastMessage(
          deptFiltered.filter((t) => t.status === 'finished'),
        );
      case 'mine':
        return sortByLastMessage(
          deptFiltered.filter(
            (t) =>
              (t.assigned_to === profile?.id ||
                t.pending_transfer_to === profile?.id) &&
              t.status !== 'finished',
          ),
        );
      case 'all':
      default:
        return todosList;
    }
  }, [deptFiltered, triageTickets, todosList, tab, profile]);

  const searched = useMemo(() => {
    let result = tabFiltered;
    if (search) {
      result = result.filter(
        (t) =>
          t.contact?.name?.toLowerCase().includes(search.toLowerCase()) ||
          t.contact?.phone?.includes(search),
      );
    }
    if (filterTag) {
      result = result.filter((t) => t.tags?.some((tag) => tag.id === filterTag));
    }
    return result;
  }, [tabFiltered, search, filterTag]);

  // Igual Agenda: sem foto local, pede refresh uma vez por contato (lista visível).
  useEffect(() => {
    const missing = searched
      .map((t) => t.contact)
      .filter((c): c is NonNullable<typeof c> => !!c?.id && !c.profile_pic_url)
      .filter((c) => !photoRefreshAttempted.current.has(c.id));

    // Limita rajada (Baileys é serial no backend).
    for (const contact of missing.slice(0, 8)) {
      photoRefreshAttempted.current.add(contact.id);
      void api(`/whatsapp/contacts/${contact.id}/refresh-photo`, { method: 'POST' }).catch(
        () => {
          /* silencioso — privacidade WA / timeout */
        },
      );
    }
  }, [searched]);

  useEffect(() => {
    if (selectedTicket) {
      const updated = ticketsWithAgenda.find((t) => t.id === selectedTicket.id);
      if (
        updated &&
        (updated !== selectedTicket ||
          updated.contact?.profile_pic_url !== selectedTicket.contact?.profile_pic_url ||
          updated.contact?.name !== selectedTicket.contact?.name)
      ) {
        setSelectedTicket(updated);
      }
    }
  }, [ticketsWithAgenda, selectedTicket]);

  useEffect(() => {
    onSelectedTicketChange?.(selectedTicket?.id ?? null);
  }, [selectedTicket?.id, onSelectedTicketChange]);

  useEffect(() => {
    if (!preselectedTicketId) return;

    const ticket = ticketsWithAgenda.find((t) => t.id === preselectedTicketId);
    if (ticket) {
      setSelectedTicket(ticket);
      onConsumePreselect?.();
      return;
    }

    let cancelled = false;
    void api<any>(`/tickets/${preselectedTicketId}`)
      .then((raw) => {
        if (cancelled || !raw) return;
        setSelectedTicket(mapTicket(raw));
        onConsumePreselect?.();
      })
      .catch(() => {
        /* keep waiting for list/socket */
      });

    return () => {
      cancelled = true;
    };
  }, [preselectedTicketId, ticketsWithAgenda, onConsumePreselect]);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    if (ticket.unread_count > 0) {
      void api(`/tickets/${ticket.id}/read`, { method: 'PATCH' }).catch(() => {});
    }
  };

  const handleAssign = async (ticket: Ticket) => {
    if (!profile) return;
    try {
      // Ticket finalizado: reabre criando/assumindo novo atendimento do contato.
      if (ticket.status === 'finished') {
        const contactId = ticket.contact_id;
        if (!contactId) return;
        const created = await api<any>(`/contacts/${contactId}/start-conversation`, {
          method: 'POST',
          body: JSON.stringify({ assume: true }),
        });
        if (created) setSelectedTicket(mapTicket(created));
        return;
      }
      const updated = await api<any>(`/tickets/${ticket.id}/assign`, { method: 'PATCH' });
      if (updated) setSelectedTicket(mapTicket(updated));
    } catch (err) {
      console.error('Error assigning ticket:', err);
    }
  };

  const handleFinish = async (ticket: Ticket) => {
    await api(`/tickets/${ticket.id}/finish`, { method: 'PATCH' });
  };

  const handleFinishSilent = async (ticket: Ticket) => {
    await api(`/tickets/${ticket.id}/finish`, {
      method: 'PATCH',
      body: JSON.stringify({ silent: true }),
    });
  };

  const handleTransfer = async (
    ticket: Ticket,
    agentId: string | null,
    options?: { notifyCustomer: boolean },
  ) => {
    await api(`/tickets/${ticket.id}/transfer`, {
      method: 'PATCH',
      body: JSON.stringify({
        assigneeId: agentId,
        notifyCustomer: options?.notifyCustomer ?? false,
      }),
    });
  };

  const handleCancelTransfer = async (ticket: Ticket) => {
    await api(`/tickets/${ticket.id}/transfer/cancel`, { method: 'PATCH' });
  };

  const tabConfig: { id: TabFilter; label: string; count: number; icon: React.ReactNode }[] = [
    {
      id: 'all',
      label: 'Todos',
      count: todosList.length,
      icon: <Inbox className="w-3.5 h-3.5" />,
    },
    {
      id: 'triage',
      label: 'Triagem',
      count: triageTickets.length,
      icon: <CircleDot className="w-3.5 h-3.5" />,
    },
    {
      id: 'attending',
      label: 'Em Atendimento',
      count: deptFiltered.filter((t) => t.status === 'attending').length,
      icon: <MessageSquare className="w-3.5 h-3.5" />,
    },
    {
      id: 'mine',
      label: 'Meus',
      count: deptFiltered.filter((t) => t.assigned_to === profile?.id && t.status !== 'finished')
        .length,
      icon: <UserCog className="w-3.5 h-3.5" />,
    },
    {
      id: 'finished',
      label: 'Finalizados',
      count: deptFiltered.filter((t) => t.status === 'finished').length,
      icon: <CheckCircle className="w-3.5 h-3.5" />,
    },
  ];

  const visibleTabs = isAdmin
    ? tabConfig
    : tabConfig.filter((t) => t.id === 'triage' || t.id === 'mine');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 border-r border-ink-700 flex flex-col bg-ink-900 flex-shrink-0">
        <div className="p-3 border-b border-ink-700">
          <h2 className="text-sm font-bold text-white mb-2">Conversas</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="input pl-9 text-sm"
            />
          </div>
          {filterTag && (
            <button
              onClick={() => setFilterTag(null)}
              className="mt-2 badge bg-brand-500/20 text-brand-300 hover:bg-brand-500/30"
            >
              <TagIcon className="w-3 h-3" />
              {tags.find((t) => t.id === filterTag)?.name}
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex gap-0.5 p-1.5 border-b border-ink-700 overflow-x-auto">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-300 hover:bg-ink-700 hover:text-white'
              }`}
            >
              {t.icon}
              {t.label}
              {t.count > 0 && (
                <span
                  className={`text-[10px] px-1 rounded-full ${
                    tab === t.id ? 'bg-white/20' : 'bg-ink-700'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {searched.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-ink-300">
              <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-xs">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            searched.map((ticket) => (
              <ConversationListItem
                key={ticket.id}
                ticket={ticket}
                isSelected={selectedTicket?.id === ticket.id}
                onClick={() => handleSelectTicket(ticket)}
                onTagClick={(tagId) => setFilterTag(tagId)}
              />
            ))
          )}
        </div>
      </div>

      {selectedTicket ? (
        <ChatDetail
          ticket={selectedTicket}
          onAssign={() => {
            void handleAssign(selectedTicket);
          }}
          onFinish={() => {
            void handleFinish(selectedTicket);
          }}
          onFinishSilent={() => {
            void handleFinishSilent(selectedTicket);
          }}
          onTransfer={(agentId: string | null, options?: { notifyCustomer: boolean }) => {
            void handleTransfer(selectedTicket, agentId, options);
          }}
          onCancelTransfer={() => {
            void handleCancelTransfer(selectedTicket);
          }}
          onTagApplied={refetchTags}
          allTags={tags}
          wallpaperClassName={wallpaper.className}
          wallpaperStyle={wallpaper.style}
          wallpaperId={wallpaperKey}
          customImageUrl={customImageUrl}
          canEditWallpaper={canEditWallpaper}
          wallpaperSaving={wallpaperSaving}
          onWallpaperChange={handleWallpaperChange}
          onCustomWallpaper={handleCustomWallpaper}
          onDeselect={() => setSelectedTicket(null)}
        />
      ) : (
        <div
          className={`flex-1 flex flex-col items-center justify-center ${wallpaper.className}`}
          style={wallpaper.style}
        >
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-ink-800 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-ink-600" />
            </div>
            <h3 className="text-lg font-semibold text-ink-200 mb-1">Selecione uma conversa</h3>
            <p className="text-sm text-ink-300">
              Escolha um ticket na lista para iniciar o atendimento
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
