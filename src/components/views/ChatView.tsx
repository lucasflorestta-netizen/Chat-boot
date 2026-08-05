import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useTickets,
  useTags,
  useAppearanceSettings,
  useContacts,
  useProfiles,
  upsertTicketFromApi,
} from '../../hooks/useData';
import { api } from '../../lib/api';
import { mapTicket } from '../../lib/mappers';
import { useAuth } from '../../context/useAuth';
import type { Ticket } from '../../types';
import { resolveWallpaper, readLocalWallpaper, writeLocalWallpaper } from '../../lib/chatWallpapers';
import { ChatDetail } from '../chat/ChatDetail';
import { ConversationListItem } from '../chat/ConversationListItem';
import {
  Search,
  Tag as TagIcon,
  UserCog,
  X,
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

/** Mantém a ordem visual estável enquanto o usuário clica (evita miss por reordenação). */
function applyFrozenOrder(sorted: Ticket[], frozenIds: string[] | null): Ticket[] {
  if (!frozenIds?.length) return sorted;
  const byId = new Map(sorted.map((t) => [t.id, t]));
  const used = new Set<string>();
  const kept: Ticket[] = [];
  for (const id of frozenIds) {
    const t = byId.get(id);
    if (!t) continue;
    kept.push(t);
    used.add(id);
  }
  const newcomers = sorted.filter((t) => !used.has(t.id));
  return [...newcomers, ...kept];
}

function selectionNeedsSync(prev: Ticket, next: Ticket): boolean {
  return (
    prev.status !== next.status ||
    prev.unread_count !== next.unread_count ||
    prev.assigned_to !== next.assigned_to ||
    prev.pending_transfer_to !== next.pending_transfer_to ||
    prev.sectorId !== next.sectorId ||
    prev.protocolo !== next.protocolo ||
    prev.last_message_at !== next.last_message_at ||
    prev.last_message?.id !== next.last_message?.id ||
    prev.contact?.name !== next.contact?.name ||
    prev.contact?.profile_pic_url !== next.contact?.profile_pic_url ||
    prev.contact?.phone !== next.contact?.phone ||
    (prev.tags?.length ?? 0) !== (next.tags?.length ?? 0)
  );
}

export function ChatView({ preselectedTicketId, onConsumePreselect, onSelectedTicketChange }: ChatViewProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canFilterByAttendant =
    profile?.apiRole === 'ADMIN' || profile?.apiRole === 'SUPERVISOR';
  const canEditWallpaper = Boolean(profile?.id);
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterAssigneeId, setFilterAssigneeId] = useState('');
  const [tab, setTab] = useState<TabFilter>('mine');
  const [localWallpaper, setLocalWallpaper] = useState(() => readLocalWallpaper());

  const { tickets, loading, loadingMore, hasMoreFinished, loadMoreFinished } = useTickets();
  const { contacts } = useContacts();
  const { tags, refetch: refetchTags } = useTags();
  const { profiles } = useProfiles();
  const { settings: appearance, saving: wallpaperSaving, update: updateAppearance } =
    useAppearanceSettings();
  const photoRefreshAttempted = useRef<Set<string>>(new Set());
  const frozenOrderIdsRef = useRef<string[] | null>(null);
  const orderFreezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderFreezeTick, setOrderFreezeTick] = useState(0);
  const searchedIdsRef = useRef<string[]>([]);

  const attendantOptions = useMemo(() => {
    if (!canFilterByAttendant) return [];
    return profiles
      .filter(
        (p) =>
          p.is_active &&
          ['OPERATOR', 'ADMIN', 'SUPERVISOR'].includes(
            String(p.apiRole ?? '').toUpperCase(),
          ),
      )
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [profiles, canFilterByAttendant]);

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

  const wallpaperKey =
    localWallpaper?.wallpaperKey ?? appearance?.wallpaperKey ?? 'linen';
  const customImageUrl =
    localWallpaper?.customImageUrl ?? appearance?.customImageUrl ?? null;
  const wallpaper = resolveWallpaper(wallpaperKey, customImageUrl);

  const handleWallpaperChange = async (id: string) => {
    if (!canEditWallpaper) return;
    const pref = { wallpaperKey: id, customImageUrl: null as string | null };
    writeLocalWallpaper(pref);
    setLocalWallpaper(pref);
    // Admin também grava o padrão global (novos usuários)
    if (profile?.apiRole === 'ADMIN') {
      try {
        await updateAppearance({ wallpaperKey: id, customImageUrl: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao salvar papel de parede';
        alert(msg);
        throw err;
      }
    }
  };

  const handleCustomWallpaper = async (url: string) => {
    if (!canEditWallpaper) return;
    const pref = { wallpaperKey: 'custom', customImageUrl: url };
    writeLocalWallpaper(pref);
    setLocalWallpaper(pref);
    if (profile?.apiRole === 'ADMIN') {
      try {
        await updateAppearance({ wallpaperKey: 'custom', customImageUrl: url });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao salvar papel de parede';
        alert(msg);
        throw err;
      }
    }
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

  /** Finalizados — 1 card por contato (mesmo dedupe de Todos). */
  const finishedList = useMemo(
    () =>
      dedupeByContact(deptFiltered.filter((t) => t.status === 'finished')),
    [deptFiltered],
  );

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
      case 'attending': {
        let attending = deptFiltered.filter((t) => t.status === 'attending');
        if (canFilterByAttendant && filterAssigneeId) {
          attending = attending.filter((t) => t.assigned_to === filterAssigneeId);
        }
        return sortByLastMessage(attending);
      }
      case 'finished':
        return finishedList;
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
  }, [
    deptFiltered,
    triageTickets,
    todosList,
    finishedList,
    tab,
    profile,
    canFilterByAttendant,
    filterAssigneeId,
  ]);

  const searchedRaw = useMemo(() => {
    let result = tabFiltered;
    if (search) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.contact?.name?.toLowerCase().includes(q) ||
          t.contact?.phone?.includes(search) ||
          t.protocolo?.toLowerCase().includes(q),
      );
    }
    if (filterTag) {
      result = result.filter((t) => t.tags?.some((tag) => tag.id === filterTag));
    }
    return result;
  }, [tabFiltered, search, filterTag]);

  const searched = useMemo(
    () => applyFrozenOrder(searchedRaw, frozenOrderIdsRef.current),
    [searchedRaw, orderFreezeTick],
  );
  searchedIdsRef.current = searched.map((t) => t.id);

  useEffect(() => {
    return () => {
      if (orderFreezeTimerRef.current) clearTimeout(orderFreezeTimerRef.current);
    };
  }, []);

  // Troca de aba/filtro: libera ordem congelada.
  useEffect(() => {
    frozenOrderIdsRef.current = null;
    if (orderFreezeTimerRef.current) {
      clearTimeout(orderFreezeTimerRef.current);
      orderFreezeTimerRef.current = null;
    }
    setOrderFreezeTick((n) => n + 1);
  }, [tab, search, filterTag, filterAssigneeId]);

  const freezeListOrder = () => {
    frozenOrderIdsRef.current = searchedIdsRef.current.slice();
    setOrderFreezeTick((n) => n + 1);
    if (orderFreezeTimerRef.current) clearTimeout(orderFreezeTimerRef.current);
    orderFreezeTimerRef.current = setTimeout(() => {
      frozenOrderIdsRef.current = null;
      orderFreezeTimerRef.current = null;
      setOrderFreezeTick((n) => n + 1);
    }, 700);
  };

  // Sem foto local (/uploads/), pede refresh (CDN ou vazio) — debounce evita rajada no clique.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const needsRefresh = (url: string | null | undefined) => {
        if (!url) return true;
        return !url.includes('/uploads/');
      };
      const missing = searchedRaw
        .map((t) => t.contact)
        .filter(
          (c): c is NonNullable<typeof c> =>
            !!c?.id && needsRefresh(c.profile_pic_url),
        )
        .filter((c) => !photoRefreshAttempted.current.has(c.id));

      for (const contact of missing.slice(0, 8)) {
        photoRefreshAttempted.current.add(contact.id);
        void api(`/whatsapp/contacts/${contact.id}/refresh-photo`, { method: 'POST' }).catch(
          () => {
            /* silencioso — privacidade WA / timeout */
          },
        );
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [searchedRaw]);

  const selectedTicketId = selectedTicket?.id ?? null;
  useEffect(() => {
    if (!selectedTicketId) return;
    const updated = ticketsWithAgenda.find((t) => t.id === selectedTicketId);
    if (!updated) return;
    setSelectedTicket((prev) => {
      if (!prev || prev.id !== updated.id) return prev;
      return selectionNeedsSync(prev, updated) ? updated : prev;
    });
  }, [ticketsWithAgenda, selectedTicketId]);

  useEffect(() => {
    onSelectedTicketChange?.(selectedTicketId);
  }, [selectedTicketId, onSelectedTicketChange]);

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
    freezeListOrder();
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
        const mapped = upsertTicketFromApi(created) ?? (created ? mapTicket(created) : null);
        if (mapped) setSelectedTicket(mapped);
        return;
      }
      const updated = await api<any>(`/tickets/${ticket.id}/assign`, { method: 'PATCH' });
      const mapped = upsertTicketFromApi(updated) ?? (updated ? mapTicket(updated) : null);
      if (mapped) setSelectedTicket(mapped);
    } catch (err) {
      console.error('Error assigning ticket:', err);
      const msg = err instanceof Error ? err.message : 'Falha ao assumir atendimento';
      alert(msg);
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

  const attendingCount = deptFiltered.filter((t) => t.status === 'attending').length;
  const mineCount = deptFiltered.filter(
    (t) => t.assigned_to === profile?.id && t.status !== 'finished',
  ).length;

  const tabConfig: {
    id: TabFilter;
    label: string;
    count: number | null;
    icon: React.ReactNode;
    accent: string;
    accentMuted: string;
  }[] = [
    {
      id: 'mine',
      label: 'Meus',
      count: mineCount,
      icon: <UserCog className="w-3.5 h-3.5" />,
      accent: 'text-success-700',
      accentMuted: 'text-success-700',
    },
    {
      id: 'attending',
      label: 'Atendimento',
      count: attendingCount,
      icon: <MessageSquare className="w-3.5 h-3.5" />,
      accent: 'text-brand-700',
      accentMuted: 'text-brand-800',
    },
    {
      id: 'triage',
      label: 'Triagem',
      count: triageTickets.length,
      icon: <CircleDot className="w-3.5 h-3.5" />,
      accent: 'text-warning-600',
      accentMuted: 'text-warning-600',
    },
    {
      id: 'all',
      label: 'Todos',
      count: null,
      icon: <Inbox className="w-3.5 h-3.5" />,
      accent: 'text-ink-50',
      accentMuted: 'text-ink-50',
    },
  ];

  const visibleTabs = isAdmin
    ? tabConfig
    : tabConfig.filter((t) => t.id === 'triage' || t.id === 'mine');

  if (loading && tickets.length === 0) {
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
              placeholder="Buscar conversa ou protocolo..."
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

        <div className="grid grid-cols-2 gap-1.5 p-2 border-b border-ink-700">
          {visibleTabs.map((t) => {
            const active = tab === t.id;
            const triageHot = t.id === 'triage' && (t.count ?? 0) > 0 && !active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                title={t.id === 'attending' ? 'Em Atendimento' : t.label}
                className={`flex flex-col items-start gap-1 px-2.5 py-2 rounded-lg text-left transition-all ${
                  t.count == null ? 'justify-center min-h-[52px]' : ''
                } ${
                  active
                    ? 'bg-brand-600 text-white ring-1 ring-brand-400/80 shadow-sm shadow-brand-900/30'
                    : triageHot
                      ? 'bg-warning-500/10 text-ink-100 border border-warning-500/40 hover:bg-warning-500/15'
                      : 'bg-ink-800/80 text-ink-200 border border-ink-700 hover:bg-ink-700 hover:border-ink-600'
                }`}
              >
                <span
                  className={`flex items-center gap-1.5 text-[11px] font-bold leading-none ${
                    active ? 'text-white/90' : t.accentMuted
                  }`}
                >
                  {t.icon}
                  {t.label}
                </span>
                {t.count != null && (
                  <span
                    className={`text-lg font-bold tabular-nums leading-none ${
                      active ? 'text-white' : t.accent
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'attending' && canFilterByAttendant && (
          <div className="px-3 py-2 border-b border-ink-700">
            <select
              id="filter-assignee"
              aria-label="Filtrar por atendente"
              className="input text-sm w-full"
              value={filterAssigneeId}
              onChange={(e) => setFilterAssigneeId(e.target.value)}
            >
              <option value="">Todos os atendentes</option>
              {attendantOptions.map((agent) => {
                const count = deptFiltered.filter(
                  (t) => t.status === 'attending' && t.assigned_to === agent.id,
                ).length;
                return (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {count > 0 ? ` (${count})` : ''}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto"
          onPointerDownCapture={freezeListOrder}
          onScroll={(e) => {
            if (!hasMoreFinished || loadingMore) return;
            // Todos e Finalizados dependem do histórico fechado paginado.
            if (tab !== 'all' && tab !== 'finished') return;
            const el = e.currentTarget;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
            if (nearBottom) {
              void loadMoreFinished();
            }
          }}
        >
          {searched.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-ink-300">
              <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-xs">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            <>
              {searched.map((ticket) => (
                <ConversationListItem
                  key={ticket.id}
                  ticket={ticket}
                  isSelected={selectedTicket?.id === ticket.id}
                  onClick={() => handleSelectTicket(ticket)}
                  onTagClick={(tagId) => setFilterTag(tagId)}
                  onPhotoError={(contactId) => {
                    if (photoRefreshAttempted.current.has(`err:${contactId}`)) return;
                    photoRefreshAttempted.current.add(`err:${contactId}`);
                    void api(`/whatsapp/contacts/${contactId}/refresh-photo`, {
                      method: 'POST',
                    }).catch(() => {
                      /* silencioso */
                    });
                  }}
                />
              ))}
              {(tab === 'all' || tab === 'finished') && (loadingMore || hasMoreFinished) && (
                <div className="py-3 text-center text-[11px] text-ink-400">
                  {loadingMore ? 'Carregando mais…' : 'Role para carregar mais'}
                </div>
              )}
            </>
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
