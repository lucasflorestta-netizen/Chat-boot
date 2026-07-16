import { useEffect, useMemo, useState } from 'react';
import { useTickets, useTags } from '../../hooks/useData';
import { api } from '../../lib/api';
import { departmentLabel } from '../../lib/mappers';
import { useAuth } from '../../context/AuthContext';
import type { Ticket } from '../../types';
import {
  getWallpaperId,
  resolveWallpaper,
  setWallpaperId,
} from '../../lib/chatWallpapers';
import { ContactAvatar } from '../ContactAvatar';
import { ChatDetail } from '../chat/ChatDetail';
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

export function ChatView({ preselectedTicketId, onConsumePreselect, onSelectedTicketChange }: ChatViewProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('triage');
  const [wallpaperId, setWallpaperIdState] = useState(() => getWallpaperId(profile?.id));

  const { tickets, loading } = useTickets();
  const { tags, refetch: refetchTags } = useTags();

  useEffect(() => {
    setWallpaperIdState(getWallpaperId(profile?.id));
  }, [profile?.id]);

  useEffect(() => {
    if (!isAdmin && tab !== 'triage' && tab !== 'mine') {
      setTab('triage');
    }
  }, [isAdmin, tab]);

  const wallpaper = resolveWallpaper(wallpaperId);

  const handleWallpaperChange = (id: string) => {
    setWallpaperIdState(id);
    if (profile?.id) setWallpaperId(profile.id, id);
  };

  const deptFiltered = useMemo(() => {
    if (isAdmin) return tickets;
    return tickets.filter(
      (t) =>
        t.status === 'triage' ||
        (profile?.sectorId != null && t.sectorId === profile.sectorId) ||
        t.assigned_to === profile?.id,
    );
  }, [tickets, profile, isAdmin]);

  const openTickets = useMemo(
    () => deptFiltered.filter((t) => t.status !== 'finished'),
    [deptFiltered],
  );

  const tabFiltered = useMemo(() => {
    switch (tab) {
      case 'triage':
        return deptFiltered.filter((t) => t.status === 'triage');
      case 'attending':
        return deptFiltered.filter((t) => t.status === 'attending');
      case 'finished':
        return deptFiltered.filter((t) => t.status === 'finished');
      case 'mine':
        return deptFiltered.filter((t) => t.assigned_to === profile?.id && t.status !== 'finished');
      default:
        return openTickets;
    }
  }, [deptFiltered, openTickets, tab, profile]);

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

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((t) => t.id === selectedTicket.id);
      if (updated && updated !== selectedTicket) {
        setSelectedTicket(updated);
      }
    }
  }, [tickets, selectedTicket]);

  useEffect(() => {
    onSelectedTicketChange?.(selectedTicket?.id ?? null);
  }, [selectedTicket?.id, onSelectedTicketChange]);

  useEffect(() => {
    if (preselectedTicketId) {
      const ticket = tickets.find((t) => t.id === preselectedTicketId);
      if (ticket) {
        setSelectedTicket(ticket);
        onConsumePreselect?.();
      }
    }
  }, [preselectedTicketId, tickets, onConsumePreselect]);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    if (ticket.unread_count > 0) {
      void api(`/tickets/${ticket.id}/read`, { method: 'PATCH' }).catch(() => {});
    }
  };

  const handleAssign = async (ticket: Ticket) => {
    if (!profile) return;
    await api(`/tickets/${ticket.id}/assign`, { method: 'PATCH' });
  };

  const handleFinish = async (ticket: Ticket) => {
    await api(`/tickets/${ticket.id}/finish`, { method: 'PATCH' });
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

  const tabConfig: { id: TabFilter; label: string; count: number; icon: React.ReactNode }[] = [
    {
      id: 'all',
      label: 'Todos',
      count: openTickets.length,
      icon: <Inbox className="w-3.5 h-3.5" />,
    },
    {
      id: 'triage',
      label: 'Triagem',
      count: deptFiltered.filter((t) => t.status === 'triage').length,
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
              <TicketListItem
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
          onTransfer={(agentId: string | null, options?: { notifyCustomer: boolean }) => {
            void handleTransfer(selectedTicket, agentId, options);
          }}
          onTagApplied={refetchTags}
          allTags={tags}
          wallpaperClassName={wallpaper.className}
          wallpaperId={wallpaperId}
          onWallpaperChange={handleWallpaperChange}
        />
      ) : (
        <div className={`flex-1 flex flex-col items-center justify-center ${wallpaper.className}`}>
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

function TicketListItem({
  ticket,
  isSelected,
  onClick,
  onTagClick,
}: {
  ticket: Ticket;
  isSelected: boolean;
  onClick: () => void;
  onTagClick: (tagId: string) => void;
}) {
  const deptColor =
    ticket.department === 'support' ? '#60a5fa' : ticket.department === 'sales' ? '#34d399' : '#a78bfa';
  const statusDot =
    ticket.status === 'triage'
      ? 'bg-warning-500'
      : ticket.status === 'attending'
        ? 'bg-brand-500'
        : 'bg-ink-500';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3 border-b border-ink-700/50 text-left transition-colors ${
        isSelected ? 'bg-brand-600/15 border-l-2 border-l-brand-500' : 'hover:bg-ink-800'
      }`}
    >
      <div className="relative flex-shrink-0">
        <ContactAvatar
          name={ticket.contact?.name}
          profilePicUrl={ticket.contact?.profile_pic_url}
          size="md"
        />
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 ${statusDot} rounded-full border-2 border-ink-900`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white truncate">
            {ticket.contact?.name ?? 'Unknown'}
          </p>
          {ticket.unread_count > 0 && (
            <span className="badge bg-success-500 text-white justify-center min-w-[18px] text-[10px] flex-shrink-0">
              {ticket.unread_count}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-300 truncate mt-0.5">{ticket.contact?.phone}</p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span
            className="badge text-[9px] px-1.5 py-0.5"
            style={{ background: `${deptColor}20`, color: deptColor }}
          >
            {departmentLabel(ticket.department)}
          </span>
          {ticket.assigned_agent && (
            <span className="inline-flex items-center gap-1 text-[9px] text-ink-300 truncate max-w-full">
              <ContactAvatar
                name={ticket.assigned_agent.name}
                profilePicUrl={ticket.assigned_agent.avatar_url}
                size="sm"
                className="!w-3.5 !h-3.5 !text-[7px]"
              />
              <span className="truncate">{ticket.assigned_agent.name}</span>
            </span>
          )}
        </div>
        {ticket.tags && ticket.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {ticket.tags.slice(0, 3).map((tag) => (
              <button
                key={tag.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick(tag.id);
                }}
                className="w-2 h-2 rounded-full hover:scale-125 transition-transform"
                style={{ background: tag.color }}
                title={tag.name}
              />
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
