import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useProfiles,
  useCannedResponses,
  useMessages,
} from '../../hooks/useData';
import { api, mediaUrl, uploadFile } from '../../lib/api';
import { departmentLabel, mapMessage, toApiMediaType } from '../../lib/mappers';
import { useAuth } from '../../context/AuthContext';
import type { Ticket, Message, Tag, Profile, MessageType } from '../../types';
import { ContactAvatar } from '../ContactAvatar';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { MediaPreview } from './MediaPreview';
import { WallpaperPicker } from './WallpaperPicker';
import { detectMediaType, MAX_UPLOAD_BYTES } from './messageUtils';
import {
  Tag as TagIcon,
  StickyNote,
  X,
  CheckCircle,
  ArrowRightCircle,
  Calendar,
  MoreVertical,
  MessageSquare,
  ChevronDown,
  Bot,
  PauseCircle,
  Settings,
  Upload,
  Eye,
} from 'lucide-react';

const NEAR_BOTTOM_PX = 120;

interface ChatDetailProps {
  ticket: Ticket;
  onAssign: () => void;
  onFinish: () => void;
  onTransfer: (agentId: string | null, options?: { notifyCustomer: boolean }) => void;
  onTagApplied: () => void;
  allTags: Tag[];
  wallpaperClassName: string;
  wallpaperStyle?: CSSProperties;
  wallpaperId: string;
  customImageUrl?: string | null;
  canEditWallpaper: boolean;
  wallpaperSaving?: boolean;
  onWallpaperChange: (id: string) => void;
  onCustomWallpaper: (url: string) => void;
}

export function ChatDetail({
  ticket,
  onAssign,
  onFinish,
  onTransfer,
  onTagApplied,
  allTags,
  wallpaperClassName,
  wallpaperStyle,
  wallpaperId,
  customImageUrl,
  canEditWallpaper,
  wallpaperSaving,
  onWallpaperChange,
  onCustomWallpaper,
}: ChatDetailProps) {
  const { profile } = useAuth();
  const {
    messages,
    loading: msgLoading,
    appendOptimistic,
    replaceOptimistic,
    failOptimistic,
    updateMessage,
  } = useMessages(ticket.id);
  const { profiles } = useProfiles();
  const { canned } = useCannedResponses();

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [togglingBotPause, setTogglingBotPause] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

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

  const handleToggleBotPaused = async () => {
    if (togglingBotPause) return;
    setTogglingBotPause(true);
    setShowActionsMenu(false);
    try {
      await api(`/tickets/${ticket.id}/bot-pause`, {
        method: 'PATCH',
        body: JSON.stringify({ paused: !ticket.bot_paused }),
      });
    } catch (err) {
      console.error('Error toggling bot pause:', err);
    } finally {
      setTogglingBotPause(false);
    }
  };

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

  useEffect(() => {
    setReplyingTo(null);
    setShowJumpLatest(false);
    stickToBottomRef.current = true;
    forceScrollRef.current = true;
    prevMsgCountRef.current = 0;
    setFileQueue([]);
    setFileError(null);
  }, [ticket.id]);

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
        deleted_by_client: false,
        is_edited: false,
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
    async (
      optimistic: Message,
      payload: {
        body?: string | null;
        mediaUrl?: string | null;
        mediaType?: string;
        mediaName?: string | null;
        replyToMessageId?: string | null;
      },
    ) => {
      appendOptimistic(optimistic);
      forceScrollRef.current = true;

      try {
        const data = await api<any>(`/tickets/${ticket.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            body: payload.body ?? undefined,
            mediaUrl: payload.mediaUrl ?? undefined,
            mediaType: payload.mediaType ?? undefined,
            mediaName: payload.mediaName ?? undefined,
            replyToMessageId: payload.replyToMessageId ?? undefined,
          }),
        });
        const mapped = mapMessage(data?.message ?? data);
        if (profile) mapped.sender = profile;
        replaceOptimistic(optimistic.id, mapped);
        setReplyingTo(null);
      } catch (err) {
        failOptimistic(optimistic.id);
        throw err instanceof Error ? err : new Error('Falha ao enviar mensagem');
      }
    },
    [appendOptimistic, failOptimistic, replaceOptimistic, ticket.id, profile],
  );

  const handleEditMessage = useCallback(
    async (message: Message, body: string) => {
      const data = await api<any>(`/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body, isEdited: true }),
      });
      const mapped = mapMessage(data?.message ?? data);
      if (message.sender) mapped.sender = message.sender;
      updateMessage(mapped);
    },
    [updateMessage],
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
      body: finalBody,
      mediaType: 'TEXT',
      replyToMessageId: replyingTo?.id ?? null,
    });
  };

  const uploadAndSendMedia = async (
    file: File | Blob,
    fileName: string,
    _contentType: string,
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
      const asFile =
        file instanceof File
          ? file
          : new File([file], fileName, { type: file.type || 'application/octet-stream' });
      const relativeUrl = await uploadFile(asFile);
      const absolute = mediaUrl(relativeUrl);

      const data = await api<any>(`/tickets/${ticket.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: caption ?? undefined,
          mediaUrl: relativeUrl,
          mediaType: toApiMediaType(mediaType),
          mediaName: fileName,
          replyToMessageId: replyingTo?.id ?? undefined,
        }),
      });

      const mapped = mapMessage(data?.message ?? data);
      mapped.sender = profile;
      if (absolute) mapped.media_url = absolute;
      replaceOptimistic(optimistic.id, mapped);
      setReplyingTo(null);
      URL.revokeObjectURL(objectUrl);
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
    setUploading(true);
    try {
      await uploadAndSendMedia(
        blob,
        fileName,
        blob.type || 'audio/webm',
        null,
        'audio',
      );
    } finally {
      setUploading(false);
    }
  };

  const enqueueFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
    const valid = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (tooBig.length && !valid.length) {
      setFileError('Arquivo(s) muito grande(s) (máximo 50 MB)');
      return;
    }
    if (tooBig.length) {
      setFileError(`${tooBig.length} arquivo(s) ignorado(s) por exceder 50 MB`);
    } else {
      setFileError(null);
    }
    if (valid.length) {
      setFileQueue((prev) => [...prev, ...valid]);
    }
  }, []);

  const handleConfirmQueuedFile = async (file: File, caption: string) => {
    setUploading(true);
    setFileError(null);
    try {
      await handleSendFile(file, caption);
      setFileQueue((q) => q.slice(1));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Falha ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const handleAddNote = async (text: string) => {
    if (!profile || !text.trim()) return;
    await api(`/tickets/${ticket.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: text.trim(), mediaType: 'NOTE' }),
    });
    setShowNote(false);
  };

  const handleSchedule = async (text: string, when: string) => {
    if (!text.trim() || !when) return;
    await api(`/tickets/${ticket.id}/scheduled`, {
      method: 'POST',
      body: JSON.stringify({
        body: text.trim(),
        scheduledFor: new Date(when).toISOString(),
      }),
    });
    setShowSchedule(false);
  };

  const handleToggleTag = async (tagId: string) => {
    const currentIds = (ticket.tags || []).map((t) => t.id);
    const nextIds = currentIds.includes(tagId)
      ? currentIds.filter((id) => id !== tagId)
      : [...currentIds, tagId];
    await api(`/tickets/${ticket.id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tagIds: nextIds }),
    });
    onTagApplied();
  };

  const isAssignedToMe = ticket.assigned_to === profile?.id;
  const isFinished = ticket.status === 'finished';
  const canInteract = !isFinished && isAssignedToMe;
  const needsAssume = !isFinished && !ticket.assigned_to;
  const isMirrorMode =
    profile?.role === 'admin' &&
    !!ticket.assigned_to &&
    ticket.assigned_to !== profile.id;

  const onDragEnter = (e: React.DragEvent) => {
    if (!canInteract) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!canInteract) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!canInteract) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent) => {
    if (!canInteract) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    enqueueFiles(files);
  };

  return (
    <div
      className="flex-1 flex flex-col min-w-0 relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {fileQueue[0] && (
        <MediaPreview
          file={fileQueue[0]}
          sending={uploading}
          remainingCount={fileQueue.length - 1}
          onCancel={() => !uploading && setFileQueue((q) => q.slice(1))}
          onSkip={() => !uploading && setFileQueue((q) => q.slice(1))}
          onCancelAll={() => !uploading && setFileQueue([])}
          onSend={(file, caption) => void handleConfirmQueuedFile(file, caption)}
        />
      )}

      {isDragging && canInteract && (
        <div className="absolute inset-0 z-30 bg-brand-600/20 border-2 border-dashed border-brand-400 rounded-lg flex items-center justify-center pointer-events-none m-1">
          <div className="flex flex-col items-center gap-2 text-white bg-ink-900/90 px-6 py-4 rounded-xl shadow-xl">
            <Upload className="w-8 h-8 text-brand-400" />
            <p className="text-sm font-semibold">Solte os arquivos aqui</p>
            <p className="text-xs text-ink-300">Envio em lote — até 50 MB por arquivo</p>
          </div>
        </div>
      )}

      {/* Chat header */}
      <ChatHeader
        ticket={ticket}
        actions={
          <div className="flex items-center gap-1">
            {ticket.bot_paused && (
              <span
                className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-warning-500/15 text-warning-400"
                title="Bot pausado neste ticket"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                Bot pausado
              </span>
            )}
            {needsAssume && (
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
            {canEditWallpaper && (
              <button
                onClick={() => {
                  setShowWallpaperPicker(!showWallpaperPicker);
                  setShowActionsMenu(false);
                }}
                className={`btn-ghost p-1.5 ${showWallpaperPicker ? 'text-brand-400' : ''}`}
                title="Papel de parede"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => {
                setShowActionsMenu(!showActionsMenu);
                setShowWallpaperPicker(false);
              }}
              className="btn-ghost p-1.5"
              title="Mais ações"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        }
        extras={
          canEditWallpaper && showWallpaperPicker ? (
            <WallpaperPicker
              selectedId={wallpaperId}
              customImageUrl={customImageUrl}
              saving={wallpaperSaving}
              onSelect={onWallpaperChange}
              onCustomUploaded={onCustomWallpaper}
              onClose={() => setShowWallpaperPicker(false)}
            />
          ) : null
        }
      />

      {isMirrorMode && (
        <div className="px-3 py-1.5 border-b border-ink-700 bg-ink-800/80 flex items-center gap-2 text-xs text-ink-300">
          <Eye className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
          <span>
            Modo leitura — acompanhando atendimento
            {ticket.assigned_agent?.name ? ` de ${ticket.assigned_agent.name}` : ''}
          </span>
        </div>
      )}

      {/* Actions dropdown */}
      {showActionsMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
          <div className="absolute z-20 top-14 right-4 w-56 card p-1.5 shadow-2xl animate-fade-in">
            <button
              onClick={handleToggleBotPaused}
              disabled={togglingBotPause}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100 disabled:opacity-50"
            >
              {ticket.bot_paused ? (
                <>
                  <Bot className="w-4 h-4 text-success-500" />
                  Retomar bot
                </>
              ) : (
                <>
                  <PauseCircle className="w-4 h-4 text-warning-400" />
                  Pausar bot
                </>
              )}
            </button>
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
                if (!canInteract) return;
                setShowNote(true);
                setShowActionsMenu(false);
              }}
              disabled={!canInteract}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              <StickyNote className="w-4 h-4 text-warning-400" />
              Adicionar Nota Interna
            </button>
            <button
              onClick={() => {
                if (!canInteract) return;
                setShowSchedule(true);
                setShowActionsMenu(false);
              }}
              disabled={!canInteract}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm text-ink-100 disabled:opacity-40 disabled:pointer-events-none"
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
                    <ContactAvatar name={p.name} profilePicUrl={p.avatar_url} size="sm" />
                    <div className="flex-1 text-left">
                      <p className="text-white">{p.name}</p>
                      <p className="text-xs text-ink-300">{departmentLabel(p.department)}</p>
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
          className={`h-full overflow-y-auto p-4 space-y-1.5 ${wallpaperClassName}`}
          style={wallpaperStyle}
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
                    onEdit={canInteract ? handleEditMessage : undefined}
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

        {needsAssume && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              onClick={onAssign}
              className="pointer-events-auto btn-primary text-sm px-5 py-2.5 shadow-xl"
            >
              Assumir Conversa
            </button>
          </div>
        )}
      </div>

      {fileError && (
        <p className="px-3 py-1 text-xs text-danger-400 bg-ink-900 border-t border-ink-700">{fileError}</p>
      )}

      {/* Input area */}
      {isFinished ? (
        <div className="border-t border-ink-700 bg-ink-900 p-4 text-center text-sm text-ink-300">
          Este ticket foi finalizado. Inicie uma nova conversa na agenda de contatos para reabrir o atendimento.
        </div>
      ) : isMirrorMode ? (
        <div className="border-t border-ink-700 bg-ink-900 p-4 text-center text-sm text-ink-300">
          Modo leitura — assuma ou transfira o atendimento para responder.
        </div>
      ) : (
        <div className={canInteract ? undefined : 'opacity-60'}>
          {(showNote || showSchedule) && canInteract && (
            <div className="border-t border-ink-700 bg-ink-900 px-3 pt-3">
              {showNote && <NoteInput onSave={handleAddNote} onCancel={() => setShowNote(false)} />}
              {showSchedule && (
                <ScheduleInput onSave={handleSchedule} onCancel={() => setShowSchedule(false)} />
              )}
            </div>
          )}
          <MessageComposer
            contactName={ticket.contact?.name}
            replyingTo={canInteract ? replyingTo : null}
            onCancelReply={() => setReplyingTo(null)}
            onSendText={handleSendText}
            onPickFiles={enqueueFiles}
            onSendAudio={handleSendAudio}
            canned={canned}
            uploading={uploading}
            disabled={!canInteract}
            placeholder={
              canInteract
                ? 'Digite uma mensagem... (use / para respostas rápidas)'
                : 'Assuma a conversa para responder'
            }
          />
        </div>
      )}
    </div>
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
