import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useProfiles,
  useCannedResponses,
  useMessages,
  useScheduledMessages,
  useNpsRatings,
} from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Ticket, Message, Tag, Profile, ScheduledMessage, NpsRating, MessageType } from '../../types';
import { DEPARTMENT_LABELS, STATUS_LABELS } from '../../types';
import { ContactAvatar } from '../ContactAvatar';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { detectMediaType, MAX_UPLOAD_BYTES, MESSAGE_SELECT } from './messageUtils';
import {
  Tag as TagIcon,
  UserCog,
  StickyNote,
  Clock,
  X,
  CheckCircle,
  ArrowRightCircle,
  History,
  Star,
  Calendar,
  MoreVertical,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';

const NEAR_BOTTOM_PX = 120;

interface ChatDetailProps {
  ticket: Ticket;
  onAssign: () => void;
  onFinish: () => void;
  onTransfer: (agentId: string | null, options?: { notifyCustomer: boolean }) => void;
  onTagApplied: () => void;
  allTags: Tag[];
  allTickets: Ticket[];
  showRightPanel: boolean;
  setShowRightPanel: (v: boolean) => void;
}

export function ChatDetail({
  ticket,
  onAssign,
  onFinish,
  onTransfer,
  onTagApplied,
  allTags,
  allTickets,
  showRightPanel,
  setShowRightPanel,
}: ChatDetailProps) {
  const { profile } = useAuth();
  const {
    messages,
    loading: msgLoading,
    appendOptimistic,
    replaceOptimistic,
    failOptimistic,
  } = useMessages(ticket.id);
  const { profiles } = useProfiles();
  const { canned } = useCannedResponses();
  const { scheduled, refetch: refetchScheduled } = useScheduledMessages(ticket.id);
  const { ratings } = useNpsRatings();

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'info' | 'history' | 'scheduled' | 'nps'>('info');
  const [showJumpLatest, setShowJumpLatest] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const prevMsgCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance <= NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpLatest(false);
  };

  useEffect(() => {
    const grew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      scrollToBottom('smooth');
      return;
    }

    if (!grew) return;

    if (stickToBottomRef.current) {
      scrollToBottom('smooth');
    } else {
      setShowJumpLatest(true);
    }
  }, [messages, scrollToBottom]);

  // Reset reply / scroll when switching tickets
  useEffect(() => {
    setReplyingTo(null);
    setShowJumpLatest(false);
    stickToBottomRef.current = true;
    forceScrollRef.current = true;
    prevMsgCountRef.current = 0;
  }, [ticket.id]);

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

  const buildOptimistic = useCallback(
    (partial: {
      body: string | null;
      media_type: MessageType;
      media_url?: string | null;
      media_name?: string | null;
    }): Message => {
      const now = new Date().toISOString();
      return {
        id: `temp-${crypto.randomUUID()}`,
        ticket_id: ticket.id,
        sender_type: 'agent',
        sender_id: profile!.id,
        body: partial.body,
        media_type: partial.media_type,
        media_url: partial.media_url ?? null,
        media_name: partial.media_name ?? null,
        is_deleted: false,
        original_body: null,
        whatsapp_delivered: false,
        whatsapp_message_id: null,
        reply_to_message_id: replyingTo?.id ?? null,
        reply_to: replyingTo ?? null,
        created_at: now,
        sender: profile,
        _localStatus: 'sending',
      };
    },
    [ticket.id, profile, replyingTo],
  );

  const insertAgentMessage = useCallback(
    async (optimistic: Message, row: Record<string, unknown>) => {
      appendOptimistic(optimistic);
      forceScrollRef.current = true;

      const { data, error } = await supabase
        .from('messages')
        .insert(row)
        .select(MESSAGE_SELECT)
        .single();

      if (error || !data) {
        failOptimistic(optimistic.id);
        throw new Error(error?.message || 'Falha ao enviar mensagem');
      }

      replaceOptimistic(optimistic.id, data as Message);
      setReplyingTo(null);
      await supabase
        .from('tickets')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', ticket.id);
    },
    [appendOptimistic, failOptimistic, replaceOptimistic, ticket.id],
  );

  const handleSendText = async (body: string) => {
    if (!profile) return;

    let finalBody = body;
    if (body.startsWith('/')) {
      const match = canned.find((c) => c.shortcut === body);
      if (match) finalBody = match.body;
    }

    const optimistic = buildOptimistic({ body: finalBody, media_type: 'text' });
    await insertAgentMessage(optimistic, {
      ticket_id: ticket.id,
      sender_type: 'agent',
      sender_id: profile.id,
      body: finalBody,
      media_type: 'text',
      whatsapp_delivered: false,
      reply_to_message_id: replyingTo?.id ?? null,
    });
  };

  const uploadAndSendMedia = async (
    file: File | Blob,
    fileName: string,
    contentType: string,
    caption: string | null,
    mediaType: 'image' | 'audio' | 'file' | 'video',
  ) => {
    if (!profile) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('Arquivo muito grande (máximo 50 MB)');
    }

    const objectUrl = URL.createObjectURL(file);
    const optimistic = buildOptimistic({
      body: caption,
      media_type: mediaType,
      media_url: objectUrl,
      media_name: fileName,
    });

    appendOptimistic(optimistic);
    forceScrollRef.current = true;

    try {
      const safeName = fileName.replace(/[^\w.\-()+ ]/g, '_');
      const path = `${ticket.id}/${Date.now()}-${safeName}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('chat-media')
        .upload(path, file, { contentType: contentType || 'application/octet-stream' });

      if (uploadErr || !uploadData) {
        throw new Error(uploadErr?.message || 'Falha ao enviar arquivo');
      }

      const publicUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;

      const { data, error } = await supabase
        .from('messages')
        .insert({
          ticket_id: ticket.id,
          sender_type: 'agent',
          sender_id: profile.id,
          body: caption,
          media_type: mediaType,
          media_url: publicUrl,
          media_name: fileName,
          whatsapp_delivered: false,
          reply_to_message_id: replyingTo?.id ?? null,
        })
        .select(MESSAGE_SELECT)
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Falha ao salvar mensagem');
      }

      replaceOptimistic(optimistic.id, data as Message);
      setReplyingTo(null);
      URL.revokeObjectURL(objectUrl);
      await supabase
        .from('tickets')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', ticket.id);
    } catch (err) {
      failOptimistic(optimistic.id);
      throw err instanceof Error ? err : new Error('Falha ao enviar mídia');
    }
  };

  const handleSendFile = async (file: File, caption: string) => {
    const mediaType = detectMediaType(file.type);
    await uploadAndSendMedia(
      file,
      file.name,
      file.type,
      caption.trim() || null,
      mediaType,
    );
  };

  const handleSendAudio = async (blob: Blob, fileName: string) => {
    await uploadAndSendMedia(
      blob,
      fileName,
      blob.type || 'audio/webm',
      null,
      'audio',
    );
  };

  const handleAddNote = async (text: string) => {
    if (!profile || !text.trim()) return;
    await supabase.from('messages').insert({
      ticket_id: ticket.id,
      sender_type: 'agent',
      sender_id: profile.id,
      body: text.trim(),
      media_type: 'note',
    });
    setShowNote(false);
  };

  const handleSchedule = async (text: string, when: string) => {
    if (!text.trim() || !when) return;
    await supabase.from('scheduled_messages').insert({
      ticket_id: ticket.id,
      body: text.trim(),
      scheduled_for: new Date(when).toISOString(),
      created_by: profile?.id,
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
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Chat header */}
        <div className="p-3 border-b border-ink-700 bg-ink-900 flex items-center gap-3">
          <div className="relative">
            <ContactAvatar
              name={ticket.contact?.name}
              profilePicUrl={ticket.contact?.profile_pic_url}
              size="md"
              className="!w-10 !h-10"
            />
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-ink-900 ${
                ticket.status === 'triage'
                  ? 'bg-warning-500'
                  : ticket.status === 'attending'
                    ? 'bg-brand-500'
                    : 'bg-ink-500'
              }`}
            />
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
                onClick={() => {
                  setShowTransfer(true);
                  setShowActionsMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <ArrowRightCircle className="w-4 h-4 text-brand-400" />
                Transferir Atendimento
              </button>
              <button
                onClick={() => {
                  setShowTagModal(true);
                  setShowActionsMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <TagIcon className="w-4 h-4 text-brand-400" />
                Gerenciar Etiquetas
              </button>
              <button
                onClick={() => {
                  setShowNote(true);
                  setShowActionsMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <StickyNote className="w-4 h-4 text-warning-400" />
                Adicionar Nota Interna
              </button>
              <button
                onClick={() => {
                  setShowSchedule(true);
                  setShowActionsMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100"
              >
                <Calendar className="w-4 h-4 text-brand-400" />
                Agendar Mensagem
              </button>
              {ticket.status !== 'finished' && (
                <button
                  onClick={() => {
                    onFinish();
                    setShowActionsMenu(false);
                  }}
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
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in"
            onClick={() => {
              setShowTransfer(false);
              setTransferTargetId(null);
            }}
          >
            <div className="card p-5 w-80" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Transferir Atendimento</h3>
                <button
                  onClick={() => {
                    setShowTransfer(false);
                    setTransferTargetId(null);
                  }}
                  className="btn-ghost p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  onTransfer(null);
                  setShowTransfer(false);
                  setTransferTargetId(null);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-ink-700 text-sm text-ink-100 mb-1 border border-ink-700"
              >
                <span className="flex items-center gap-2">
                  <ArrowRightCircle className="w-4 h-4 text-warning-400" />
                  Voltar para Triagem
                </span>
              </button>
              <p className="text-xs text-ink-300 px-1 mb-1 mt-2">Transferir para agente:</p>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {profiles
                  .filter((p: Profile) => p.id !== profile?.id && p.is_active)
                  .map((p: Profile) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setTransferTargetId(p.id);
                        setShowTransfer(false);
                      }}
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

        {/* Transfer notify choice modal */}
        {transferTargetId && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in"
            onClick={() => setTransferTargetId(null)}
          >
            <div className="card p-5 w-80" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Transferir Atendimento</h3>
                <button onClick={() => setTransferTargetId(null)} className="btn-ghost p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-ink-200 mb-4">
                Deseja transferir em silêncio ou avisar o cliente?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    onTransfer(transferTargetId, { notifyCustomer: false });
                    setTransferTargetId(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg border border-ink-700 hover:bg-ink-700 text-sm text-ink-100"
                >
                  Transferir em silêncio
                </button>
                <button
                  onClick={() => {
                    onTransfer(transferTargetId, { notifyCustomer: true });
                    setTransferTargetId(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg btn-primary text-sm"
                >
                  Avisar o cliente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tag modal */}
        {showTagModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in"
            onClick={() => setShowTagModal(false)}
          >
            <div className="card p-5 w-80" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Etiquetas do Ticket</h3>
                <button onClick={() => setShowTagModal(false)} className="btn-ghost p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {allTags.map((tag) => {
                  const active = ticket.tags?.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-ink-700 ${
                        active ? 'bg-ink-700' : ''
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full" style={{ background: tag.color }} />
                      <span className="text-ink-100 flex-1 text-left">{tag.name}</span>
                      {active && <CheckCircle className="w-4 h-4 text-success-500" />}
                    </button>
                  );
                })}
                {allTags.length === 0 && (
                  <p className="text-xs text-ink-300 px-2 py-3 text-center">
                    Nenhuma etiqueta criada. Vá em Etiquetas para criar.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto chat-bg p-4 space-y-1.5"
          >
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
                    <MessageBubble
                      message={msg}
                      contactName={ticket.contact?.name}
                      onReply={canInteract ? setReplyingTo : undefined}
                    />
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {showJumpLatest && (
            <button
              type="button"
              onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-600 text-white text-xs font-medium shadow-lg hover:bg-brand-500 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Novas mensagens
            </button>
          )}
        </div>

        {/* Input area */}
        {canInteract ? (
          <div>
            {(showNote || showSchedule) && (
              <div className="border-t border-ink-700 bg-ink-900 px-3 pt-3">
                {showNote && <NoteInput onSave={handleAddNote} onCancel={() => setShowNote(false)} />}
                {showSchedule && (
                  <ScheduleInput onSave={handleSchedule} onCancel={() => setShowSchedule(false)} />
                )}
              </div>
            )}
            <MessageComposer
              contactName={ticket.contact?.name}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              onSendText={handleSendText}
              onSendFile={handleSendFile}
              onSendAudio={handleSendAudio}
              canned={canned}
            />
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
          <div className="flex gap-0.5 p-1.5 border-b border-ink-700">
            <RightTabButton
              active={rightTab === 'info'}
              onClick={() => setRightTab('info')}
              icon={<UserCog className="w-4 h-4" />}
              label="Info"
            />
            <RightTabButton
              active={rightTab === 'history'}
              onClick={() => setRightTab('history')}
              icon={<History className="w-4 h-4" />}
              label="Histórico"
            />
            <RightTabButton
              active={rightTab === 'scheduled'}
              onClick={() => setRightTab('scheduled')}
              icon={<Calendar className="w-4 h-4" />}
              label="Agendadas"
            />
            <RightTabButton
              active={rightTab === 'nps'}
              onClick={() => setRightTab('nps')}
              icon={<Star className="w-4 h-4" />}
              label="NPS"
            />
            <button onClick={() => setShowRightPanel(false)} className="btn-ghost p-1.5 ml-auto rounded-md">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'info' && <InfoPanel ticket={ticket} />}
            {rightTab === 'history' && (
              <HistoryPanel tickets={contactHistory} currentTicketId={ticket.id} />
            )}
            {rightTab === 'scheduled' && <ScheduledPanel scheduled={scheduled} />}
            {rightTab === 'nps' && <NpsPanel ratings={ticketNps} />}
          </div>
        </div>
      )}
    </>
  );
}

function RightTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
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

function NoteInput({ onSave, onCancel }: { onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  return (
    <div className="mb-2 bg-warning-500/10 border border-warning-500/30 rounded-lg p-2">
      <div className="flex items-center gap-2 mb-1">
        <StickyNote className="w-4 h-4 text-warning-400" />
        <span className="text-xs font-medium text-warning-400">Nota Interna (não enviada ao cliente)</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        rows={2}
        placeholder="Digite uma observação interna..."
        className="input bg-ink-800 text-sm"
      />
      <div className="flex gap-2 mt-2">
        <button onClick={() => onSave(text)} className="btn-primary text-xs px-3 py-1">
          Salvar Nota
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ScheduleInput({
  onSave,
  onCancel,
}: {
  onSave: (text: string, when: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  return (
    <div className="mb-2 bg-brand-500/10 border border-brand-500/30 rounded-lg p-2">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="w-4 h-4 text-brand-400" />
        <span className="text-xs font-medium text-brand-400">Agendar Mensagem</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        rows={2}
        placeholder="Mensagem a ser enviada..."
        className="input bg-ink-800 text-sm mb-2"
      />
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="input bg-ink-800 text-sm"
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onSave(text, when)}
          className="btn-primary text-xs px-3 py-1"
          disabled={!text.trim() || !when}
        >
          Agendar
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function InfoPanel({ ticket }: { ticket: Ticket }) {
  return (
    <div className="p-4 space-y-4">
      <div className="text-center">
        <ContactAvatar
          name={ticket.contact?.name}
          profilePicUrl={ticket.contact?.profile_pic_url}
          size="lg"
          rounded="2xl"
          className="mx-auto mb-2"
        />
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
              <span
                key={tag.id}
                className="badge text-xs"
                style={{ background: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  capitalize,
  small,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-ink-300">{label}</span>
      <span className={`text-white ${capitalize ? 'capitalize' : ''} ${small ? 'text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function HistoryPanel({
  tickets,
  currentTicketId,
}: {
  tickets: Ticket[];
  currentTicketId: string;
}) {
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
              <span className="text-[10px] text-ink-300">
                {new Date(t.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-300">
              <span className="badge text-[10px] bg-ink-700">{DEPARTMENT_LABELS[t.department]}</span>
              {t.assigned_agent && <span>Atendente: {t.assigned_agent.name}</span>}
            </div>
            {t.tags && t.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {t.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="badge text-[10px]"
                    style={{ background: `${tag.color}20`, color: tag.color }}
                  >
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
          {Array.from(new Set(tickets.map((t) => t.assigned_agent?.name).filter(Boolean))).map(
            (name) => (
              <span key={name} className="badge bg-ink-700 text-ink-100 text-xs">
                {name}
              </span>
            ),
          )}
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
                    <Star
                      key={s}
                      className={`w-4 h-4 ${
                        s <= r.rating! ? 'text-warning-400 fill-warning-400' : 'text-ink-600'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-ink-300">Nota: {r.rating}/5</p>
              </>
            ) : (
              <p className="text-xs text-ink-300">Aguardando avaliação do cliente...</p>
            )}
            <p className="text-[10px] text-ink-300 mt-1">
              {new Date(r.created_at).toLocaleString('pt-BR')}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
