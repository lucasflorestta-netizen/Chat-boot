import { useEffect, useMemo, useRef, useState } from 'react';
import { useTickets, useTags, useProfiles, useCannedResponses, useMessages, useScheduledMessages, useNpsRatings } from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Ticket, Message, Tag, Profile, ScheduledMessage, NpsRating } from '../../types';
import { DEPARTMENT_LABELS, STATUS_LABELS } from '../../types';
import {
  Search,
  Tag as TagIcon,
  UserCog,
  StickyNote,
  Send,
  Paperclip,
  Smile,
  Clock,
  X,
  CheckCircle,
  ArrowRightCircle,
  Trash2,
  History,
  Zap,
  Star,
  Calendar,
  MoreVertical,
  MessageSquare,
  Inbox,
  CircleDot,
} from 'lucide-react';

interface ChatViewProps {
  preselectedTicketId?: string | null;
  onConsumePreselect?: () => void;
  onNotify?: (type: 'message' | 'ticket', title: string, body: string) => void;
}

type TabFilter = 'all' | 'triage' | 'attending' | 'finished' | 'mine';

export function ChatView({ preselectedTicketId, onConsumePreselect, onNotify }: ChatViewProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('all');
  const [showRightPanel, setShowRightPanel] = useState(true);

  const { tickets, loading } = useTickets();
  const { tags, refetch: refetchTags } = useTags();

  const deptFiltered = useMemo(() => {
    if (profile?.role === 'admin') return tickets;
    return tickets.filter((t) => t.department === profile?.department || t.status === 'triage');
  }, [tickets, profile]);

  const tabFiltered = useMemo(() => {
    switch (tab) {
      case 'triage': return deptFiltered.filter((t) => t.status === 'triage');
      case 'attending': return deptFiltered.filter((t) => t.status === 'attending');
      case 'finished': return deptFiltered.filter((t) => t.status === 'finished');
      case 'mine': return deptFiltered.filter((t) => t.assigned_to === profile?.id && t.status !== 'finished');
      default: return deptFiltered;
    }
  }, [deptFiltered, tab, profile]);

  const searched = useMemo(() => {
    let result = tabFiltered;
    if (search) {
      result = result.filter(
        (t) =>
          t.contact?.name?.toLowerCase().includes(search.toLowerCase()) ||
          t.contact?.phone?.includes(search)
      );
    }
    if (filterTag) {
      result = result.filter((t) => t.tags?.some((tag) => tag.id === filterTag));
    }
    return result;
  }, [tabFiltered, search, filterTag]);

  // Keep selected ticket in sync with latest data
  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((t) => t.id === selectedTicket.id);
      if (updated && updated !== selectedTicket) {
        setSelectedTicket(updated);
      }
    }
  }, [tickets, selectedTicket]);

  // Handle preselection
  useEffect(() => {
    if (preselectedTicketId) {
      const ticket = tickets.find((t) => t.id === preselectedTicketId);
      if (ticket) {
        setSelectedTicket(ticket);
        onConsumePreselect?.();
      }
    }
  }, [preselectedTicketId, tickets, onConsumePreselect]);

  // Notify on new client messages
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('new-message-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_type === 'client' && msg.ticket_id !== selectedTicket?.id) {
            onNotify?.('message', 'Nova mensagem', 'Você recebeu uma nova mensagem de cliente');
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, onNotify, selectedTicket]);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    if (ticket.unread_count > 0) {
      supabase.from('tickets').update({ unread_count: 0 }).eq('id', ticket.id).then(() => {});
    }
  };

  const handleAssign = async (ticket: Ticket) => {
    if (!profile) return;
    await supabase.from('tickets').update({
      status: 'attending',
      assigned_to: profile.id,
    }).eq('id', ticket.id);
  };

  const handleFinish = async (ticket: Ticket) => {
    const { data: autoSettings } = await supabase.from('auto_message_settings').select('*').maybeSingle();
    await supabase.from('tickets').update({
      status: 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', ticket.id);

    const closingMsg = autoSettings?.closing_message || 'Seu atendimento foi finalizado. Obrigado pelo contato!';
    await supabase.from('messages').insert({
      ticket_id: ticket.id,
      sender_type: 'system',
      body: closingMsg,
      media_type: 'text',
      whatsapp_delivered: false,
    });

    if (autoSettings?.nps_active) {
      const npsQuestion = autoSettings?.nps_question || 'Como você avalia nosso atendimento hoje? Digite de 1 a 5.';
      await supabase.from('messages').insert({
        ticket_id: ticket.id,
        sender_type: 'system',
        body: npsQuestion,
        media_type: 'text',
        whatsapp_delivered: false,
      });
      await supabase.from('nps_ratings').insert({
        ticket_id: ticket.id,
        contact_id: ticket.contact_id,
        rating: null,
      });
    }
  };

  const handleTransfer = async (ticket: Ticket, agentId: string | null) => {
    if (agentId) {
      await supabase.from('tickets').update({ assigned_to: agentId, status: 'attending' }).eq('id', ticket.id);
    } else {
      await supabase.from('tickets').update({ assigned_to: null, status: 'triage' }).eq('id', ticket.id);
    }
  };

  const tabConfig: { id: TabFilter; label: string; count: number; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Todos', count: deptFiltered.length, icon: <Inbox className="w-3.5 h-3.5" /> },
    { id: 'triage', label: 'Triagem', count: deptFiltered.filter((t) => t.status === 'triage').length, icon: <CircleDot className="w-3.5 h-3.5" /> },
    { id: 'attending', label: 'Em Atendimento', count: deptFiltered.filter((t) => t.status === 'attending').length, icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'mine', label: 'Meus', count: deptFiltered.filter((t) => t.assigned_to === profile?.id && t.status !== 'finished').length, icon: <UserCog className="w-3.5 h-3.5" /> },
    { id: 'finished', label: 'Finalizados', count: deptFiltered.filter((t) => t.status === 'finished').length, icon: <CheckCircle className="w-3.5 h-3.5" /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ===================== LEFT: TICKET LIST ===================== */}
      <div className="w-80 border-r border-ink-700 flex flex-col bg-ink-900 flex-shrink-0">
        {/* Header */}
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

        {/* Tabs */}
        <div className="flex gap-0.5 p-1.5 border-b border-ink-700 overflow-x-auto">
          {tabConfig.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'
              }`}
            >
              {t.icon}
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] px-1 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-ink-700'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Ticket list */}
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

      {/* ===================== CENTER: CHAT ===================== */}
      {selectedTicket ? (
        <ChatDetail
          ticket={selectedTicket}
          onAssign={() => handleAssign(selectedTicket)}
          onFinish={() => handleFinish(selectedTicket)}
          onTransfer={(agentId) => handleTransfer(selectedTicket, agentId)}
          onTagApplied={refetchTags}
          allTags={tags}
          allTickets={tickets}
          showRightPanel={showRightPanel}
          setShowRightPanel={setShowRightPanel}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center chat-bg">
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-ink-800 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-ink-600" />
            </div>
            <h3 className="text-lg font-semibold text-ink-200 mb-1">Selecione uma conversa</h3>
            <p className="text-sm text-ink-300">Escolha um ticket na lista para iniciar o atendimento</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TICKET LIST ITEM (left panel)
// ============================================================
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
  const deptColor = ticket.department === 'support' ? '#60a5fa' : ticket.department === 'sales' ? '#34d399' : '#a78bfa';
  const statusDot = ticket.status === 'triage' ? 'bg-warning-500' : ticket.status === 'attending' ? 'bg-brand-500' : 'bg-ink-500';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-3 border-b border-ink-700/50 text-left transition-colors ${
        isSelected ? 'bg-brand-600/15 border-l-2 border-l-brand-500' : 'hover:bg-ink-800'
      }`}
    >
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-ink-600 to-ink-700 flex items-center justify-center text-sm font-semibold text-ink-100">
          {ticket.contact?.name?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <span className={`absolute bottom-0 right-0 w-3 h-3 ${statusDot} rounded-full border-2 border-ink-900`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white truncate">{ticket.contact?.name ?? 'Unknown'}</p>
          {ticket.unread_count > 0 && (
            <span className="badge bg-success-500 text-white justify-center min-w-[18px] text-[10px] flex-shrink-0">
              {ticket.unread_count}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-300 truncate mt-0.5">{ticket.contact?.phone}</p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="badge text-[9px] px-1.5 py-0.5" style={{ background: `${deptColor}20`, color: deptColor }}>
            {DEPARTMENT_LABELS[ticket.department]}
          </span>
          {ticket.assigned_agent && (
            <span className="text-[9px] text-ink-300 truncate">{ticket.assigned_agent.name}</span>
          )}
        </div>
        {ticket.tags && ticket.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {ticket.tags.slice(0, 3).map((tag) => (
              <button
                key={tag.id}
                onClick={(e) => { e.stopPropagation(); onTagClick(tag.id); }}
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

// ============================================================
// CHAT DETAIL (center + right)
// ============================================================
function ChatDetail({
  ticket,
  onAssign,
  onFinish,
  onTransfer,
  onTagApplied,
  allTags,
  allTickets,
  showRightPanel,
  setShowRightPanel,
}: {
  ticket: Ticket;
  onAssign: () => void;
  onFinish: () => void;
  onTransfer: (agentId: string | null) => void;
  onTagApplied: () => void;
  allTags: Tag[];
  allTickets: Ticket[];
  showRightPanel: boolean;
  setShowRightPanel: (v: boolean) => void;
}) {
  const { profile } = useAuth();
  const { messages, loading: msgLoading } = useMessages(ticket.id);
  const { profiles } = { profiles: useProfiles().profiles };
  const { canned } = { canned: useCannedResponses().canned };
  const { scheduled, refetch: refetchScheduled } = useScheduledMessages(ticket.id);
  const { ratings } = useNpsRatings();
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [rightTab, setRightTab] = useState<'info' | 'history' | 'scheduled' | 'nps'>('info');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check for NPS rating in client messages
  useEffect(() => {
    const lastClientMsgs = messages.filter((m) => m.sender_type === 'client').slice(-1);
    if (lastClientMsgs.length > 0) {
      const rating = parseInt(lastClientMsgs[0].body || '', 10);
      if (rating >= 1 && rating <= 5) {
        const unrated = ratings.find((r) => r.ticket_id === ticket.id && r.rating === null);
        if (unrated) {
          supabase.from('nps_ratings').update({ rating }).eq('id', unrated.id).then(() => {});
        }
      }
    }
  }, [messages, ratings, ticket.id]);

  const handleSend = async () => {
    if (!input.trim() || !profile) return;
    const body = input.trim();
    setInput('');
    setShowEmoji(false);
    setShowCanned(false);

    if (body.startsWith('/')) {
      const match = canned.find((c) => c.shortcut === body);
      if (match) {
        await supabase.from('messages').insert({
          ticket_id: ticket.id, sender_type: 'agent', sender_id: profile.id, body: match.body, media_type: 'text',
          whatsapp_delivered: false,
        });
        await supabase.from('tickets').update({ last_message_at: new Date().toISOString() }).eq('id', ticket.id);
        return;
      }
    }

    await supabase.from('messages').insert({
      ticket_id: ticket.id, sender_type: 'agent', sender_id: profile.id, body, media_type: 'text',
      whatsapp_delivered: false,
    });
    await supabase.from('tickets').update({ last_message_at: new Date().toISOString() }).eq('id', ticket.id);
  };

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadError(null);
    let mediaType: 'image' | 'audio' | 'file' | 'video' = 'file';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';
    else if (file.type.startsWith('video/')) mediaType = 'video';

    const fileName = `${ticket.id}/${Date.now()}-${file.name}`;
    const { data: uploadData, error: uploadErr } = await supabase.storage.from('chat-media').upload(fileName, file);
    if (uploadErr || !uploadData) {
      setUploadError(uploadErr?.message || 'Falha ao enviar arquivo');
      return;
    }
    const publicUrl = supabase.storage.from('chat-media').getPublicUrl(fileName).data.publicUrl;

    await supabase.from('messages').insert({
      ticket_id: ticket.id, sender_type: 'agent', sender_id: profile.id,
      body: null, media_type: mediaType, media_url: publicUrl, media_name: file.name,
      whatsapp_delivered: false,
    });
    await supabase.from('tickets').update({ last_message_at: new Date().toISOString() }).eq('id', ticket.id);
    e.target.value = '';
  };

  const handleAddNote = async (text: string) => {
    if (!profile || !text.trim()) return;
    await supabase.from('messages').insert({
      ticket_id: ticket.id, sender_type: 'agent', sender_id: profile.id, body: text.trim(), media_type: 'note',
    });
    setShowNote(false);
  };

  const handleSchedule = async (text: string, when: string) => {
    if (!text.trim() || !when) return;
    await supabase.from('scheduled_messages').insert({
      ticket_id: ticket.id, body: text.trim(), scheduled_for: new Date(when).toISOString(), created_by: profile?.id,
    });
    setShowSchedule(false);
    refetchScheduled();
  };

  const handleToggleTag = async (tagId: string) => {
    const existing = ticket.tags?.find((t) => t.id === tagId);
    if (existing) {
      await supabase.from('ticket_tags').delete().eq('ticket_id', ticket.id).eq('tag_id', tagId);
    } else {
      await supabase.from('ticket_tags').insert({ ticket_id: ticket.id, tag_id: tagId });
    }
    onTagApplied();
  };

  const isAssignedToMe = ticket.assigned_to === profile?.id;
  const canInteract = ticket.status !== 'finished' && (isAssignedToMe || ticket.status === 'triage');
  const ticketNps = ratings.filter((r) => r.ticket_id === ticket.id);
  const contactHistory = allTickets.filter((t) => t.contact_id === ticket.contact_id);

  return (
    <>
      {/* ===================== CENTER: CHAT ===================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="p-3 border-b border-ink-700 bg-ink-900 flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ink-600 to-ink-700 flex items-center justify-center text-sm font-semibold text-ink-100">
              {ticket.contact?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-ink-900 ${
              ticket.status === 'triage' ? 'bg-warning-500' : ticket.status === 'attending' ? 'bg-brand-500' : 'bg-ink-500'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{ticket.contact?.name}</p>
            <p className="text-xs text-ink-300 flex items-center gap-1.5">
              {ticket.contact?.phone}
              <span className="text-ink-500">·</span>
              <span className="text-brand-400">{DEPARTMENT_LABELS[ticket.department]}</span>
              {ticket.assigned_agent && (
                <>
                  <span className="text-ink-500">·</span>
                  <span>{ticket.assigned_agent.name}</span>
                </>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {ticket.status === 'triage' && (
              <button onClick={onAssign} className="btn-primary text-xs px-3 py-1.5">
                Assumir Atendimento
              </button>
            )}
            {canInteract && ticket.status === 'attending' && (
              <button onClick={onFinish} className="btn-secondary text-xs px-3 py-1.5 text-success-500">
                <CheckCircle className="w-3.5 h-3.5" />
                Finalizar
              </button>
            )}
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="btn-ghost p-1.5"
              title="Mais ações"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              className={`btn-ghost p-1.5 ${showRightPanel ? 'text-brand-400' : ''}`}
              title="Painel"
            >
              <UserCog className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Actions dropdown */}
        {showActionsMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
            <div className="absolute z-20 top-14 right-20 w-56 card p-1.5 shadow-2xl animate-fade-in">
              <button
                onClick={() => { setShowTransfer(true); setShowActionsMenu(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <ArrowRightCircle className="w-4 h-4 text-brand-400" />
                Transferir Atendimento
              </button>
              <button
                onClick={() => { setShowTagModal(true); setShowActionsMenu(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <TagIcon className="w-4 h-4 text-brand-400" />
                Gerenciar Etiquetas
              </button>
              <button
                onClick={() => { setShowNote(true); setShowActionsMenu(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <StickyNote className="w-4 h-4 text-warning-400" />
                Adicionar Nota Interna
              </button>
              <button
                onClick={() => { setShowSchedule(true); setShowActionsMenu(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <Calendar className="w-4 h-4 text-brand-400" />
                Agendar Mensagem
              </button>
              {ticket.status !== 'finished' && (
                <button
                  onClick={() => { onFinish(); setShowActionsMenu(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-danger-400"
                >
                  <CheckCircle className="w-4 h-4" />
                  Finalizar Ticket
                </button>
              )}
            </div>
          </>
        )}

        {/* Transfer modal */}
        {showTransfer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowTransfer(false)}>
            <div className="card p-5 w-80" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Transferir Atendimento</h3>
                <button onClick={() => setShowTransfer(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
              </div>
              <button
                onClick={() => { onTransfer(null); setShowTransfer(false); }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-ink-700 text-sm text-ink-100 mb-1 border border-ink-700"
              >
                <span className="flex items-center gap-2">
                  <ArrowRightCircle className="w-4 h-4 text-warning-400" />
                  Voltar para Triagem
                </span>
              </button>
              <p className="text-xs text-ink-300 px-1 mb-1 mt-2">Transferir para agente:</p>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {profiles.filter((p: Profile) => p.id !== profile?.id && p.is_active).map((p: Profile) => (
                  <button
                    key={p.id}
                    onClick={() => { onTransfer(p.id); setShowTransfer(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink-700 text-sm text-ink-100"
                  >
                    <div className="w-8 h-8 rounded-full bg-ink-700 flex items-center justify-center text-xs font-semibold">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white">{p.name}</p>
                      <p className="text-xs text-ink-300">{DEPARTMENT_LABELS[p.department]}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tag modal */}
        {showTagModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowTagModal(false)}>
            <div className="card p-5 w-80" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Etiquetas do Ticket</h3>
                <button onClick={() => setShowTagModal(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {allTags.map((tag) => {
                  const active = ticket.tags?.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-ink-700 ${active ? 'bg-ink-700' : ''}`}
                    >
                      <span className="w-4 h-4 rounded-full" style={{ background: tag.color }} />
                      <span className="text-ink-100 flex-1 text-left">{tag.name}</span>
                      {active && <CheckCircle className="w-4 h-4 text-success-500" />}
                    </button>
                  );
                })}
                {allTags.length === 0 && (
                  <p className="text-xs text-ink-300 px-2 py-3 text-center">Nenhuma etiqueta criada. Vá em Etiquetas para criar.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto chat-bg p-4 space-y-1.5">
          {msgLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-ink-300">
              <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">Nenhuma mensagem ainda. Inicie a conversa!</p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1];
              const showDateSeparator = !prev || !isSameDay(prev.created_at, msg.created_at);
              return (
                <div key={msg.id}>
                  {showDateSeparator && <DateSeparator date={msg.created_at} />}
                  <MessageBubble message={msg} />
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        {canInteract ? (
          <div className="border-t border-ink-700 bg-ink-900 p-3 relative">
            {showNote && <NoteInput onSave={handleAddNote} onCancel={() => setShowNote(false)} />}
            {showSchedule && <ScheduleInput onSave={handleSchedule} onCancel={() => setShowSchedule(false)} />}
            {showCanned && (
              <div className="mb-2 max-h-48 overflow-y-auto card p-1.5">
                {canned.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setInput(c.body); setShowCanned(false); }}
                    className="w-full text-left px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm"
                  >
                    <span className="text-brand-400 font-mono text-xs">{c.shortcut}</span>
                    <span className="text-ink-200 ml-2">{c.title}</span>
                  </button>
                ))}
                {canned.length === 0 && <p className="text-xs text-ink-300 px-2 py-1">Nenhuma resposta rápida cadastrada.</p>}
              </div>
            )}
            {showEmoji && <EmojiPicker onSelect={(e) => setInput((prev) => prev + e)} onClose={() => setShowEmoji(false)} />}

            {uploadError && (
              <p className="text-xs text-danger-400 mb-1">{uploadError}</p>
            )}

            <div className="flex items-end gap-1.5">
              <div className="flex gap-0.5">
                <label className="btn-ghost p-2 cursor-pointer rounded-lg" title="Enviar arquivo">
                  <Paperclip className="w-4 h-4" />
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                </label>
                <button onClick={() => setShowEmoji(!showEmoji)} className="btn-ghost p-2 rounded-lg" title="Emoji">
                  <Smile className="w-4 h-4" />
                </button>
                <button onClick={() => setShowCanned(!showCanned)} className="btn-ghost p-2 rounded-lg" title="Respostas rápidas">
                  <Zap className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Digite uma mensagem... (use / para respostas rápidas)"
                rows={1}
                className="input flex-1 resize-none max-h-32"
              />
              <button onClick={handleSend} disabled={!input.trim()} className="btn-primary p-2.5 rounded-lg">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-ink-700 bg-ink-900 p-4 text-center text-sm text-ink-300">
            {ticket.status === 'finished'
              ? 'Este ticket foi finalizado. Inicie uma nova conversa na agenda de contatos para reabrir o atendimento.'
              : 'Clique em "Assumir Atendimento" para iniciar a conversa com este cliente.'}
          </div>
        )}
      </div>

      {/* ===================== RIGHT: INFO PANEL ===================== */}
      {showRightPanel && (
        <div className="w-80 border-l border-ink-700 bg-ink-900 flex flex-col flex-shrink-0">
          {/* Tabs */}
          <div className="flex gap-0.5 p-1.5 border-b border-ink-700">
            <RightTabButton active={rightTab === 'info'} onClick={() => setRightTab('info')} icon={<UserCog className="w-4 h-4" />} label="Info" />
            <RightTabButton active={rightTab === 'history'} onClick={() => setRightTab('history')} icon={<History className="w-4 h-4" />} label="Histórico" />
            <RightTabButton active={rightTab === 'scheduled'} onClick={() => setRightTab('scheduled')} icon={<Calendar className="w-4 h-4" />} label="Agendadas" />
            <RightTabButton active={rightTab === 'nps'} onClick={() => setRightTab('nps')} icon={<Star className="w-4 h-4" />} label="NPS" />
            <button onClick={() => setShowRightPanel(false)} className="btn-ghost p-1.5 ml-auto rounded-md">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'info' && <InfoPanel ticket={ticket} />}
            {rightTab === 'history' && <HistoryPanel tickets={contactHistory} currentTicketId={ticket.id} />}
            {rightTab === 'scheduled' && <ScheduledPanel scheduled={scheduled} />}
            {rightTab === 'nps' && <NpsPanel ratings={ticketNps} />}
          </div>
        </div>
      )}
    </>
  );
}

function RightTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all flex-1 ${
        active ? 'bg-ink-700 text-white' : 'text-ink-300 hover:bg-ink-800'
      }`}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

// ============================================================
// DATE SEPARATOR
// ============================================================
function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  let label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  if (d.toDateString() === today.toDateString()) label = 'Hoje';
  else if (d.toDateString() === yesterday.toDateString()) label = 'Ontem';

  return (
    <div className="flex items-center justify-center my-3">
      <span className="text-[10px] text-ink-300 bg-ink-800 px-3 py-1 rounded-full">{label}</span>
    </div>
  );
}

// ============================================================
// MESSAGE BUBBLE
// ============================================================
function MessageBubble({ message }: { message: Message }) {
  const isClient = message.sender_type === 'client';
  const isNote = message.media_type === 'note';
  const isSystem = message.sender_type === 'system' || message.sender_type === 'bot';

  if (isNote) {
    return (
      <div className="flex justify-center my-2">
        <div className="max-w-md w-full bg-warning-500/10 border border-warning-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <StickyNote className="w-3.5 h-3.5 text-warning-400" />
            <span className="text-xs font-medium text-warning-400">Nota Interna</span>
            <span className="text-xs text-ink-300">· {message.sender?.name ?? 'Agente'}</span>
          </div>
          <p className="text-sm text-warning-400/90 whitespace-pre-wrap">{message.body}</p>
          <span className="text-[10px] text-ink-300 mt-1 block">
            {new Date(message.created_at).toLocaleString('pt-BR')}
          </span>
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 max-w-md">
          <p className="text-xs text-ink-200 text-center whitespace-pre-wrap">{message.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[75%] ${isClient ? 'bg-ink-700' : 'bg-brand-600'} rounded-2xl p-3 group relative`}>
        {/* Tail */}
        <div className={`absolute top-0 ${isClient ? '-left-1' : '-right-1'} w-3 h-3 ${isClient ? 'bg-ink-700' : 'bg-brand-600'} rounded-tr-lg rounded-bl-lg`} />

        {message.is_deleted ? (
          <div>
            <div className="flex items-center gap-1.5 text-warning-400 text-xs mb-1">
              <Trash2 className="w-3 h-3" />
              <span className="italic">Mensagem apagada pelo cliente</span>
            </div>
            <p className="text-sm text-ink-300 line-through whitespace-pre-wrap">{message.original_body}</p>
          </div>
        ) : (
          <>
            {message.media_type === 'image' && message.media_url && (
              <img src={message.media_url} alt={message.media_name || ''} className="rounded-lg mb-2 max-w-full" />
            )}
            {message.media_type === 'audio' && message.media_url && (
              <audio controls src={message.media_url} className="w-full mb-2" />
            )}
            {message.media_type === 'file' && message.media_url && (
              <a href={message.media_url} download={message.media_name || ''} className="flex items-center gap-2 text-sm text-white hover:underline mb-2">
                <Paperclip className="w-4 h-4" />
                {message.media_name}
              </a>
            )}
            {message.body && (
              <p className="text-sm text-white whitespace-pre-wrap break-words">{message.body}</p>
            )}
          </>
        )}
        <div className="flex items-center gap-1 mt-0.5">
          {!isClient && message.sender && (
            <span className="text-[10px] text-white/60">{message.sender.name}</span>
          )}
          <span className="text-[10px] text-white/50 ml-auto">
            {new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EMOJI PICKER
// ============================================================
function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const emojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🔥', '✅', '❌', '🙏', '👏', '💯', '🎉', '😢', '😡', '⭐', '📞', '💬', '✨'];
  return (
    <div className="absolute bottom-14 left-3 card p-2 shadow-xl z-30 animate-fade-in">
      <div className="grid grid-cols-7 gap-1">
        {emojis.map((e) => (
          <button key={e} onClick={() => onSelect(e)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-ink-700 text-lg">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// NOTE INPUT
// ============================================================
function NoteInput({ onSave, onCancel }: { onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  return (
    <div className="mb-2 bg-warning-500/10 border border-warning-500/30 rounded-lg p-2">
      <div className="flex items-center gap-2 mb-1">
        <StickyNote className="w-4 h-4 text-warning-400" />
        <span className="text-xs font-medium text-warning-400">Nota Interna (não enviada ao cliente)</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus rows={2}
        placeholder="Digite uma observação interna..." className="input bg-ink-800 text-sm" />
      <div className="flex gap-2 mt-2">
        <button onClick={() => onSave(text)} className="btn-primary text-xs px-3 py-1">Salvar Nota</button>
        <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1">Cancelar</button>
      </div>
    </div>
  );
}

// ============================================================
// SCHEDULE INPUT
// ============================================================
function ScheduleInput({ onSave, onCancel }: { onSave: (text: string, when: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  return (
    <div className="mb-2 bg-brand-500/10 border border-brand-500/30 rounded-lg p-2">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="w-4 h-4 text-brand-400" />
        <span className="text-xs font-medium text-brand-400">Agendar Mensagem</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus rows={2}
        placeholder="Mensagem a ser enviada..." className="input bg-ink-800 text-sm mb-2" />
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input bg-ink-800 text-sm" />
      <div className="flex gap-2 mt-2">
        <button onClick={() => onSave(text, when)} className="btn-primary text-xs px-3 py-1" disabled={!text.trim() || !when}>Agendar</button>
        <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1">Cancelar</button>
      </div>
    </div>
  );
}

// ============================================================
// RIGHT PANEL COMPONENTS
// ============================================================
function InfoPanel({ ticket }: { ticket: Ticket }) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-ink-600 to-ink-700 flex items-center justify-center text-2xl font-bold text-ink-100 mx-auto mb-2">
          {ticket.contact?.name?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <p className="text-sm font-semibold text-white">{ticket.contact?.name}</p>
        <p className="text-xs text-ink-300">{ticket.contact?.phone}</p>
      </div>

      <div className="space-y-2 text-sm">
        <InfoRow label="Status" value={STATUS_LABELS[ticket.status]} />
        <InfoRow label="Departamento" value={DEPARTMENT_LABELS[ticket.department]} />
        <InfoRow label="Prioridade" value={ticket.priority} capitalize />
        <InfoRow label="Atendente" value={ticket.assigned_agent?.name ?? 'Não atribuído'} />
        <InfoRow label="Criado em" value={new Date(ticket.created_at).toLocaleString('pt-BR')} small />
      </div>

      {ticket.tags && ticket.tags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-200 mb-2">Etiquetas</p>
          <div className="flex flex-wrap gap-1">
            {ticket.tags.map((tag) => (
              <span key={tag.id} className="badge text-xs" style={{ background: `${tag.color}20`, color: tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, capitalize, small }: { label: string; value: string; capitalize?: boolean; small?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-ink-300">{label}</span>
      <span className={`text-white ${capitalize ? 'capitalize' : ''} ${small ? 'text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function HistoryPanel({ tickets, currentTicketId }: { tickets: Ticket[]; currentTicketId: string }) {
  return (
    <div className="p-4 space-y-3">
      <div className="text-sm font-semibold text-white">
        Histórico do Cliente ({tickets.length} atendimentos)
      </div>
      {tickets.length === 0 ? (
        <p className="text-xs text-ink-300">Nenhum histórico anterior.</p>
      ) : (
        tickets.map((t) => (
          <div key={t.id} className={`card p-3 ${t.id === currentTicketId ? 'border-brand-500' : ''}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-white">{STATUS_LABELS[t.status]}</span>
              <span className="text-[10px] text-ink-300">{new Date(t.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-300">
              <span className="badge text-[10px] bg-ink-700">{DEPARTMENT_LABELS[t.department]}</span>
              {t.assigned_agent && <span>Atendente: {t.assigned_agent.name}</span>}
            </div>
            {t.tags && t.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {t.tags.map((tag) => (
                  <span key={tag.id} className="badge text-[10px]" style={{ background: `${tag.color}20`, color: tag.color }}>
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
      <div className="mt-4 pt-3 border-t border-ink-700">
        <p className="text-xs font-medium text-ink-200 mb-2">Atendentes que conversaram:</p>
        <div className="flex flex-wrap gap-1">
          {Array.from(new Set(tickets.map((t) => t.assigned_agent?.name).filter(Boolean))).map((name) => (
            <span key={name} className="badge bg-ink-700 text-ink-100 text-xs">{name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduledPanel({ scheduled }: { scheduled: ScheduledMessage[] }) {
  return (
    <div className="p-4 space-y-2">
      <p className="text-sm font-semibold text-white mb-2">Mensagens Agendadas</p>
      {scheduled.length === 0 ? (
        <p className="text-xs text-ink-300">Nenhuma mensagem agendada.</p>
      ) : (
        scheduled.map((s) => (
          <div key={s.id} className="card p-3">
            <p className="text-sm text-ink-100">{s.body}</p>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-ink-300">
              <Clock className="w-3 h-3" />
              {new Date(s.scheduled_for).toLocaleString('pt-BR')}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function NpsPanel({ ratings }: { ratings: NpsRating[] }) {
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm font-semibold text-white mb-2">Avaliações NPS</p>
      {ratings.length === 0 ? (
        <p className="text-xs text-ink-300">Nenhuma avaliação para este ticket.</p>
      ) : (
        ratings.map((r) => (
          <div key={r.id} className="card p-3 text-center">
            {r.rating ? (
              <>
                <div className="flex justify-center gap-0.5 mb-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`w-4 h-4 ${s <= r.rating! ? 'text-warning-400 fill-warning-400' : 'text-ink-600'}`} />
                  ))}
                </div>
                <p className="text-xs text-ink-300">Nota: {r.rating}/5</p>
              </>
            ) : (
              <p className="text-xs text-ink-300">Aguardando avaliação do cliente...</p>
            )}
            <p className="text-[10px] text-ink-300 mt-1">{new Date(r.created_at).toLocaleString('pt-BR')}</p>
          </div>
        ))
      )}
    </div>
  );
}
