import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Star,
  Trash2,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import { api, mediaUrl, uploadFile } from '../../lib/api';
import { toApiMediaType } from '../../lib/mappers';
import {
  loadRecentStickers,
  pushRecentSticker,
  type RecentSticker,
} from '../../lib/recentStickers';
import { connectSocket, getSocket } from '../../lib/socket';
import type { Message, MessageType, WhatsappGroup, WhatsappGroupMessage } from '../../types';
import { ContactAvatar } from '../ContactAvatar';
import { MessageComposer } from '../chat/MessageComposer';
import { detectMediaType, MAX_UPLOAD_BYTES } from '../chat/messageUtils';

function normalizeMediaType(raw?: string | null): string {
  return (raw ?? 'TEXT').toUpperCase();
}

function mediaTypeLabel(raw?: string | null): string {
  switch (normalizeMediaType(raw)) {
    case 'IMAGE':
      return 'Foto';
    case 'STICKER':
      return 'Figurinha';
    case 'AUDIO':
      return 'Áudio';
    case 'VIDEO':
      return 'Vídeo';
    case 'FILE':
      return 'Arquivo';
    default:
      return 'Mensagem';
  }
}

/** Adapta mensagem de grupo para o MessageComposer (barra de reply). */
function toComposerMessage(m: WhatsappGroupMessage): Message {
  const mt = normalizeMediaType(m.mediaType).toLowerCase() as MessageType;
  return {
    id: m.id,
    ticket_id: m.groupJid,
    sender_type: m.fromMe ? 'agent' : 'client',
    sender_id: null,
    body: m.text || null,
    media_type: ['image', 'audio', 'file', 'video', 'sticker', 'text', 'note'].includes(mt)
      ? mt
      : 'text',
    media_url: mediaUrl(m.mediaUrl) ?? m.mediaUrl ?? null,
    media_name: m.mediaName ?? null,
    is_deleted: !!m.deleted,
    deleted_by_client: false,
    deleted_for_client: false,
    is_edited: !!m.edited,
    original_body: null,
    whatsapp_delivered: true,
    whatsapp_message_id: m.id,
    reply_to_message_id: m.replyTo?.id ?? null,
    created_at: m.timestamp,
  };
}

function isPdf(name?: string | null) {
  return !!name && /\.pdf$/i.test(name);
}

const NEAR_BOTTOM_PX = 120;

export function GroupsView() {
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappGroupMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<WhatsappGroupMessage | null>(null);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [recentStickers, setRecentStickers] = useState<RecentSticker[]>(() =>
    loadRecentStickers(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
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

  const closeConversation = useCallback(() => {
    setSelectedId(null);
    setReplyingTo(null);
    setShowStarredOnly(false);
    setShowJumpLatest(false);
    setError(null);
  }, []);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<WhatsappGroup[]>('/whatsapp/groups');
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      setGroups([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar grupos');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (groupJid: string, silent = false) => {
    if (!silent) setMessagesLoading(true);
    try {
      const data = await api<WhatsappGroupMessage[]>(
        `/whatsapp/groups/${encodeURIComponent(groupJid)}/messages`,
      );
      if (selectedIdRef.current === groupJid) {
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      if (!silent && selectedIdRef.current === groupJid) {
        setMessages([]);
        setError(e instanceof Error ? e.message : 'Falha ao carregar mensagens');
      }
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setReplyingTo(null);
      setShowStarredOnly(false);
      setShowJumpLatest(false);
      prevMsgCountRef.current = 0;
      return;
    }
    setMessages([]);
    setReplyingTo(null);
    stickToBottomRef.current = true;
    forceScrollRef.current = true;
    setShowJumpLatest(false);
    prevMsgCountRef.current = 0;
    void loadMessages(selectedId);
    void api(`/whatsapp/groups/${encodeURIComponent(selectedId)}/read`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch(() => {
      /* mark-read best-effort */
    });
    const timer = setInterval(() => {
      void loadMessages(selectedId, true);
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const grew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      scrollToBottom(messagesLoading ? 'auto' : 'smooth');
      return;
    }

    if (!grew) return;

    if (stickToBottomRef.current) {
      scrollToBottom('smooth');
    } else {
      setShowJumpLatest(true);
    }
  }, [messages, messagesLoading, scrollToBottom]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!selectedIdRef.current) return;
      e.preventDefault();
      closeConversation();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeConversation]);

  useEffect(() => {
    const socket = getSocket() ?? connectSocket();

    const onGroupMessage = (entry: WhatsappGroupMessage) => {
      if (!entry?.groupJid || !entry?.id) return;
      if (selectedIdRef.current === entry.groupJid) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === entry.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx]!, ...entry };
            return next;
          }
          return [...prev, entry];
        });
      }
      setGroups((prev) =>
        prev.map((g) =>
          g.id === entry.groupJid ? { ...g, lastMessage: entry } : g,
        ),
      );
    };

    const onGroupPhoto = (payload: {
      groupJid: string;
      profilePicUrl: string;
    }) => {
      if (!payload?.groupJid || !payload.profilePicUrl) return;
      setGroups((prev) =>
        prev.map((g) =>
          g.id === payload.groupJid
            ? { ...g, profilePicUrl: payload.profilePicUrl }
            : g,
        ),
      );
    };

    const onSenderPhoto = (payload: {
      senderJid: string;
      profilePicUrl: string;
    }) => {
      if (!payload?.senderJid || !payload.profilePicUrl) return;
      const payloadDigits = (payload.senderJid.split('@')[0] ?? '').replace(
        /\D/g,
        '',
      );
      setMessages((prev) =>
        prev.map((m) => {
          if (!m.senderJid) return m;
          if (m.senderJid === payload.senderJid) {
            return { ...m, senderProfilePicUrl: payload.profilePicUrl };
          }
          // PN com mesmo número (device variants)
          if (
            m.senderJid.includes('@s.whatsapp.net') &&
            payload.senderJid.includes('@s.whatsapp.net') &&
            payloadDigits.length >= 8
          ) {
            const md = (m.senderJid.split('@')[0] ?? '').replace(/\D/g, '');
            if (md === payloadDigits) {
              return { ...m, senderProfilePicUrl: payload.profilePicUrl };
            }
          }
          return m;
        }),
      );
    };

    socket.on('group.message', onGroupMessage);
    socket.on('group.photo', onGroupPhoto);
    socket.on('group.sender.photo', onSenderPhoto);
    return () => {
      socket.off('group.message', onGroupMessage);
      socket.off('group.photo', onGroupPhoto);
      socket.off('group.sender.photo', onSenderPhoto);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.subject.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q),
    );
  }, [groups, search]);

  const visibleMessages = useMemo(() => {
    if (!showStarredOnly) return messages;
    return messages.filter((m) => m.starred && !m.deleted);
  }, [messages, showStarredOnly]);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  const upsertMessage = useCallback((sent: WhatsappGroupMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === sent.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...prev[idx]!, ...sent };
        return next;
      }
      return [...prev, sent];
    });
  }, []);

  const postGroupMessage = useCallback(
    async (payload: {
      text?: string;
      mediaUrl?: string;
      mediaType?: string;
      mediaName?: string;
      replyToMessageId?: string;
    }) => {
      if (!selectedId) return;
      forceScrollRef.current = true;
      const sent = await api<WhatsappGroupMessage>(
        `/whatsapp/groups/${encodeURIComponent(selectedId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      upsertMessage(sent);
      setReplyingTo(null);
      return sent;
    },
    [selectedId, upsertMessage],
  );

  const handleSendText = async (body: string) => {
    if (!selectedId || sending) return;
    setSending(true);
    setError(null);
    try {
      await postGroupMessage({
        text: body,
        replyToMessageId: replyingTo?.id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar mensagem');
      throw e;
    } finally {
      setSending(false);
    }
  };

  const uploadAndSendMedia = async (
    file: File | Blob,
    fileName: string,
    mediaType: 'image' | 'audio' | 'file' | 'video' | 'sticker',
    caption?: string | null,
  ) => {
    if (!selectedId) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('Arquivo muito grande (máximo 50 MB)');
    }
    setSending(true);
    setError(null);
    try {
      const asFile =
        file instanceof File
          ? file
          : new File([file], fileName, {
              type: file.type || 'application/octet-stream',
            });
      const relativeUrl = await uploadFile(asFile);
      await postGroupMessage({
        text: caption?.trim() || undefined,
        mediaUrl: relativeUrl,
        mediaType: toApiMediaType(mediaType),
        mediaName: fileName,
        replyToMessageId: replyingTo?.id,
      });
      if (mediaType === 'sticker') {
        setRecentStickers(pushRecentSticker(relativeUrl));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao enviar mídia';
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      setSending(false);
    }
  };

  const handlePickFiles = (files: File[]) => {
    void (async () => {
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError('Arquivo muito grande (máximo 50 MB)');
          continue;
        }
        const mediaType = detectMediaType(file.type);
        try {
          await uploadAndSendMedia(file, file.name, mediaType);
        } catch {
          /* error already set */
        }
      }
    })();
  };

  const handleSendAudio = async (blob: Blob, fileName: string) => {
    await uploadAndSendMedia(blob, fileName, 'audio');
  };

  const handleSendSticker = async (file: File) => {
    await uploadAndSendMedia(file, file.name || 'sticker.webp', 'sticker');
  };

  const handleSendStickerUrl = async (url: string) => {
    if (!selectedId) return;
    setSending(true);
    setError(null);
    try {
      await postGroupMessage({
        mediaUrl: url,
        mediaType: 'STICKER',
        mediaName: 'sticker.webp',
        replyToMessageId: replyingTo?.id,
      });
      setRecentStickers(pushRecentSticker(url));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar figurinha');
      throw e;
    } finally {
      setSending(false);
    }
  };

  const toggleStar = async (message: WhatsappGroupMessage) => {
    if (!selectedId || message.deleted) return;
    const next = !message.starred;
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, starred: next } : m)),
    );
    try {
      const updated = await api<WhatsappGroupMessage>(
        `/whatsapp/groups/${encodeURIComponent(selectedId)}/messages/${encodeURIComponent(message.id)}/star`,
        {
          method: 'PATCH',
          body: JSON.stringify({ starred: next }),
        },
      );
      upsertMessage(updated);
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, starred: message.starred } : m,
        ),
      );
      setError(e instanceof Error ? e.message : 'Falha ao favoritar');
    }
  };

  const handleDeleteMessage = async (message: WhatsappGroupMessage) => {
    if (!selectedId || !message.fromMe || message.deleted) return;
    if (
      !window.confirm(
        'Apagar esta mensagem para todos no WhatsApp? Ela continua visível no chat-boot.',
      )
    ) {
      return;
    }
    setError(null);
    try {
      const updated = await api<WhatsappGroupMessage>(
        `/whatsapp/groups/${encodeURIComponent(selectedId)}/messages/${encodeURIComponent(message.id)}`,
        { method: 'DELETE' },
      );
      upsertMessage(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao apagar mensagem');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      <aside className="w-80 border-r border-ink-700 flex flex-col bg-ink-900/40">
        <div className="p-4 border-b border-ink-700 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Grupos</h2>
              <p className="text-xs text-ink-400">
                {groups.length} grupo{groups.length === 1 ? '' : 's'} do WhatsApp
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadGroups()}
              className="btn-ghost p-2"
              title="Atualizar lista"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 w-full"
              placeholder="Buscar grupo..."
            />
          </div>
        </div>

        {error && !selected && (
          <div className="m-3 p-3 rounded-lg bg-danger-500/10 border border-danger-500/30 text-sm text-danger-300 flex items-start gap-2">
            <WifiOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-ink-400 text-sm">
              {error
                ? 'Não foi possível listar os grupos. Verifique a conexão WhatsApp.'
                : 'Nenhum grupo encontrado.'}
            </div>
          ) : (
            filtered.map((group) => {
              const active = group.id === selectedId;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSelectedId(group.id);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-ink-800 transition-colors ${
                    active
                      ? 'bg-brand-600/20 border-l-2 border-l-brand-500'
                      : 'hover:bg-ink-800/60'
                  }`}
                >
                  <ContactAvatar
                    name={group.subject}
                    profilePicUrl={mediaUrl(group.profilePicUrl)}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {group.subject}
                    </p>
                    <p className="text-xs text-ink-400 truncate">
                      {group.participantsCount} participante
                      {group.participantsCount === 1 ? '' : 's'}
                      {group.description ? ` · ${group.description}` : ''}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-ink-950">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-400 gap-3">
            <UsersRound className="w-12 h-12 text-ink-600" />
            <p className="text-sm">Selecione um grupo para conversar</p>
          </div>
        ) : (
          <>
            <header className="px-4 py-3 border-b border-ink-700 flex items-center gap-3">
              <ContactAvatar
                name={selected.subject}
                profilePicUrl={mediaUrl(selected.profilePicUrl)}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white truncate">
                  {selected.subject}
                </h3>
                <p className="text-xs text-ink-400">
                  {selected.participantsCount} participantes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStarredOnly((v) => !v)}
                className={`btn-ghost p-2 rounded-lg ${
                  showStarredOnly ? 'text-warning-300 bg-warning-500/10' : ''
                }`}
                title={
                  showStarredOnly
                    ? 'Mostrar todas as mensagens'
                    : 'Ver favoritas'
                }
              >
                <Star
                  className={`w-4 h-4 ${showStarredOnly ? 'fill-current' : ''}`}
                />
              </button>
            </header>

            {error && (
              <div className="mx-4 mt-3 p-2 rounded-lg bg-danger-500/10 border border-danger-500/30 text-xs text-danger-300">
                {error}
              </div>
            )}

            <div className="relative flex-1 min-h-0">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto py-3"
            >
              {messagesLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="text-center text-ink-500 text-sm py-10 px-4">
                  {showStarredOnly
                    ? 'Nenhuma mensagem favoritada neste grupo.'
                    : 'Nenhuma mensagem recente neste grupo ainda.'}
                </div>
              ) : (
                visibleMessages.map((message) => {
                  const mt = normalizeMediaType(message.mediaType);
                  const src = mediaUrl(message.mediaUrl) ?? message.mediaUrl;
                  const deleted = !!message.deleted;
                  return (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2 group/row ${
                        message.fromMe ? 'justify-end' : 'justify-start'
                      } my-1 px-3`}
                      onDoubleClick={() => {
                        if (!deleted) setReplyingTo(message);
                      }}
                    >
                      {!message.fromMe && (
                        <ContactAvatar
                          name={
                            message.senderName?.trim() ||
                            message.senderJid?.split('@')[0] ||
                            'Participante'
                          }
                          profilePicUrl={mediaUrl(message.senderProfilePicUrl)}
                          size="sm"
                        />
                      )}
                      <div className="flex items-center gap-1 max-w-[75%]">
                        {!deleted && (
                          <div
                            className={`flex items-center gap-0.5 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity ${
                              message.fromMe ? 'order-first' : 'order-last'
                            }`}
                          >
                            {message.fromMe && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteMessage(message)}
                                className="btn-ghost p-1.5 rounded-full bg-ink-800/80 border border-ink-600"
                                title="Apagar para todos"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-ink-200" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setReplyingTo(message)}
                              className="btn-ghost p-1.5 rounded-full bg-ink-800/80 border border-ink-600"
                              title="Responder"
                            >
                              <Reply className="w-3.5 h-3.5 text-ink-200" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleStar(message)}
                              className={`btn-ghost p-1.5 rounded-full bg-ink-800/80 border border-ink-600 ${
                                message.starred ? 'text-warning-300' : ''
                              }`}
                              title={
                                message.starred
                                  ? 'Remover dos favoritos'
                                  : 'Favoritar'
                              }
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  message.starred ? 'fill-current' : 'text-ink-200'
                                }`}
                              />
                            </button>
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-3 py-2 ${
                            message.fromMe
                              ? 'bg-brand-600 text-white rounded-br-md'
                              : 'bg-ink-800 text-ink-100 rounded-bl-md border border-ink-700'
                          }`}
                        >
                          {!message.fromMe && (
                            <p className="text-[11px] font-semibold text-brand-300 mb-0.5">
                              {message.senderName?.trim() ||
                                message.senderJid?.split('@')[0] ||
                                'Participante'}
                            </p>
                          )}

                          {message.replyTo && (
                            <div
                              className={`mb-2 rounded-md px-2 py-1.5 border-l-2 ${
                                message.fromMe
                                  ? 'bg-black/20 border-white/70'
                                  : 'bg-ink-900/80 border-brand-400'
                              }`}
                            >
                              <p
                                className={`text-[11px] font-semibold truncate ${
                                  message.fromMe
                                    ? 'text-white/90'
                                    : 'text-brand-400'
                                }`}
                              >
                                {message.replyTo.fromMe
                                  ? 'Você'
                                  : message.replyTo.senderName?.trim() ||
                                    'Participante'}
                              </p>
                              <p
                                className={`text-[11px] truncate ${
                                  message.fromMe
                                    ? 'text-white/70'
                                    : 'text-ink-300'
                                }`}
                              >
                                {message.replyTo.text?.trim() ||
                                  mediaTypeLabel(message.replyTo.mediaType)}
                              </p>
                            </div>
                          )}

                          <div className={deleted ? 'opacity-60' : undefined}>
                            {src && mt === 'IMAGE' && (
                              <img
                                src={src}
                                alt={message.mediaName || 'Imagem'}
                                className="rounded-lg max-w-full max-h-64 mb-1 object-contain"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            {src && mt === 'STICKER' && (
                              <img
                                src={src}
                                alt="Figurinha"
                                className="mb-1 max-w-[160px]"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            {src && mt === 'AUDIO' && (
                              <audio
                                controls
                                src={src}
                                className="w-full min-w-[220px] mb-1"
                              />
                            )}
                            {src && mt === 'VIDEO' && (
                              <video
                                controls
                                src={src}
                                className="rounded-lg mb-1 max-w-full max-h-64"
                              />
                            )}
                            {src && mt === 'FILE' && (
                              <a
                                href={src}
                                download={message.mediaName || ''}
                                target="_blank"
                                rel="noreferrer"
                                className={`flex items-center gap-3 mb-1 rounded-lg p-2.5 ${
                                  message.fromMe
                                    ? 'bg-black/15'
                                    : 'bg-ink-900/80'
                                } hover:opacity-90`}
                              >
                                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                                  {isPdf(message.mediaName) ? (
                                    <FileText className="w-5 h-5 text-danger-300" />
                                  ) : (
                                    <Paperclip className="w-5 h-5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm truncate">
                                    {message.mediaName || 'Arquivo'}
                                  </p>
                                  <p className="text-[10px] opacity-70">
                                    Toque para baixar
                                  </p>
                                </div>
                              </a>
                            )}
                            {message.text ? (
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {message.text}
                              </p>
                            ) : null}
                          </div>

                          {deleted && (
                            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-black/35 px-2 py-1.5 text-warning-300">
                              <Eye className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-xs italic">
                                {message.fromMe
                                  ? 'Apagada para todos'
                                  : 'Apagada no WhatsApp'}
                              </span>
                            </div>
                          )}

                          <span
                            className={`text-[10px] mt-1 flex items-center gap-1 ${
                              message.fromMe ? 'text-white/70' : 'text-ink-400'
                            }`}
                          >
                            {message.starred && (
                              <Star className="w-3 h-3 fill-current text-warning-300" />
                            )}
                            {message.edited && <span>editada · </span>}
                            {new Date(message.timestamp).toLocaleTimeString(
                              'pt-BR',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
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

            <footer className="p-3 border-t border-ink-700">
              <MessageComposer
                contactName={
                  replyingTo
                    ? replyingTo.fromMe
                      ? 'Você'
                      : replyingTo.senderName?.trim() || 'Participante'
                    : selected.subject
                }
                replyingTo={
                  replyingTo ? toComposerMessage(replyingTo) : null
                }
                onCancelReply={() => setReplyingTo(null)}
                onSendText={handleSendText}
                onPickFiles={handlePickFiles}
                onSendAudio={handleSendAudio}
                onSendSticker={handleSendSticker}
                onSendStickerUrl={handleSendStickerUrl}
                recentStickers={recentStickers}
                canned={[]}
                disabled={!selectedId}
                uploading={sending}
                placeholder="Mensagem para o grupo..."
              />
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
