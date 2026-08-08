import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Image as ImageIcon,
  Loader2,
  MessageCircleMore,
  Search,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { mediaUrl } from '../../lib/api';
import {
  compressInternalChatImage,
  uploadInternalChatFile,
} from '../../lib/internalChatUpload';
import {
  loadRecentStickers,
  mergeRecentStickers,
  pushRecentSticker,
  type RecentSticker,
} from '../../lib/recentStickers';
import {
  readLocalWallpaper,
  resolveWallpaper,
  writeLocalWallpaper,
} from '../../lib/chatWallpapers';
import { useCannedResponses, useAppearanceSettings } from '../../hooks/useData';
import {
  useInternalChat,
  toUiMessage,
  type InternalChatMediaType,
  type InternalConversationItem,
} from '../../hooks/useInternalChat';
import { ContactAvatar } from '../ContactAvatar';
import { MessageBubble } from '../chat/MessageBubble';
import { MessageComposer } from '../chat/MessageComposer';
import { MediaPreview } from '../chat/MediaPreview';
import { WallpaperPicker } from '../chat/WallpaperPicker';
import { detectMediaType, MAX_UPLOAD_BYTES } from '../chat/messageUtils';
import type { Message } from '../../types';

function previewText(msg: InternalConversationItem['lastMessage']): string {
  if (!msg) return 'Nenhuma mensagem ainda';
  if (msg.deletedAt) return 'Mensagem apagada';
  if (msg.body?.trim()) {
    const t = msg.body.trim();
    return t.length > 40 ? `${t.slice(0, 40)}…` : t;
  }
  if (msg.type === 'IMAGE') return 'Enviou uma imagem';
  if (msg.type === 'AUDIO') return 'Enviou um áudio';
  if (msg.type === 'VIDEO') return 'Enviou um vídeo';
  if (msg.type === 'STICKER') return 'Enviou uma figurinha';
  if (msg.type === 'FILE') return msg.mediaName || 'Enviou um arquivo';
  return 'Nova mensagem';
}

function toApiType(
  mediaType: 'image' | 'audio' | 'file' | 'video' | 'sticker',
): InternalChatMediaType {
  switch (mediaType) {
    case 'image':
      return 'IMAGE';
    case 'audio':
      return 'AUDIO';
    case 'video':
      return 'VIDEO';
    case 'sticker':
      return 'STICKER';
    default:
      return 'FILE';
  }
}

export function InternalChatView() {
  const { profile } = useAuth();
  const { canned } = useCannedResponses();
  const { settings: appearance, update: updateAppearance } = useAppearanceSettings();
  const {
    conversations,
    onlineUserIds,
    loading,
    messages,
    messagesLoading,
    selected,
    typingUserIds,
    selectConversation,
    sendMessage,
    editMessage,
    deleteMessage,
    emitTyping,
  } = useInternalChat(profile?.id);

  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [localWallpaper, setLocalWallpaper] = useState(() => readLocalWallpaper());
  const [recentStickers, setRecentStickers] = useState<RecentSticker[]>(() =>
    loadRecentStickers(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** Abertura da conversa: ir direto à última mensagem (como no atendimento). */
  const pendingInitialScrollRef = useRef(false);
  const prevMsgCountRef = useRef(0);
  const dragDepthRef = useRef(0);
  const typingTimer = useRef<number | null>(null);

  const canEditWallpaper =
    profile?.apiRole === 'ADMIN' || profile?.apiRole === 'SUPERVISOR';

  const wallpaperKey =
    localWallpaper?.wallpaperKey ?? appearance?.wallpaperKey ?? 'linen';
  const customImageUrl =
    localWallpaper?.customImageUrl ?? appearance?.customImageUrl ?? null;
  const wallpaper = resolveWallpaper(wallpaperKey, customImageUrl);

  const jumpToBottomInstant = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
    stickToBottomRef.current = true;
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (behavior === 'auto') {
        jumpToBottomInstant();
        return;
      }
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      stickToBottomRef.current = true;
    },
    [jumpToBottomInstant],
  );

  useEffect(() => {
    if (messagesLoading) return;

    if (pendingInitialScrollRef.current) {
      pendingInitialScrollRef.current = false;
      prevMsgCountRef.current = messages.length;
      // Duplo rAF: espera o DOM pintar as bolhas antes de posicionar
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          jumpToBottomInstant();
        });
      });
      return;
    }

    const grew = messages.length > prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (!grew && typingUserIds.length === 0) return;

    if (stickToBottomRef.current) {
      scrollToBottom(grew ? 'smooth' : 'auto');
    }
  }, [
    messages,
    messagesLoading,
    typingUserIds.length,
    jumpToBottomInstant,
    scrollToBottom,
  ]);

  useEffect(() => {
    setReplyingTo(null);
    setFileQueue([]);
    setFileError(null);
    setShowWallpaperPicker(false);
    stickToBottomRef.current = true;
    pendingInitialScrollRef.current = true;
    prevMsgCountRef.current = 0;
  }, [selected?.id, selected?.peer?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const typingLabel = useMemo(() => {
    if (!typingUserIds.length || !selected) return null;
    const names = typingUserIds.map((id) => {
      const peer = conversations.find((c) => c.peer?.id === id)?.peer;
      const fromMsg = messages.find((m) => m.senderId === id)?.sender;
      return (
        peer?.name?.trim() ||
        peer?.username ||
        fromMsg?.name?.trim() ||
        fromMsg?.username ||
        'Alguém'
      );
    });
    if (names.length === 1) return `${names[0]} está digitando…`;
    return 'Várias pessoas estão digitando…';
  }, [typingUserIds, selected, conversations, messages]);

  const uiMessages = useMemo(
    () => messages.map((m) => toUiMessage(m, profile?.id)),
    [messages, profile?.id],
  );

  const stickerUrls = useMemo(
    () =>
      messages
        .filter((m) => m.type === 'STICKER' && m.mediaUrl)
        .map((m) => m.mediaUrl as string),
    [messages],
  );

  const mergedStickers = useMemo(
    () => mergeRecentStickers(recentStickers, stickerUrls),
    [recentStickers, stickerUrls],
  );

  const rememberSticker = useCallback((url: string) => {
    setRecentStickers(pushRecentSticker(url));
  }, []);

  const handleSendText = async (body: string) => {
    let finalBody = body;
    if (body.startsWith('/')) {
      const match = canned.find((c) => c.shortcut === body);
      if (match) finalBody = match.body;
    }
    emitTyping(false);
    await sendMessage({
      body: finalBody,
      type: 'TEXT',
      replyToMessageId: replyingTo?.id ?? null,
    });
    setReplyingTo(null);
  };

  const uploadAndSendMedia = async (
    file: File | Blob,
    fileName: string,
    mediaType: 'image' | 'audio' | 'file' | 'video' | 'sticker',
    caption: string | null,
  ) => {
    const size = 'size' in file ? file.size : 0;
    if (size > MAX_UPLOAD_BYTES) {
      throw new Error('Arquivo muito grande (máximo 50 MB)');
    }
    let asFile =
      file instanceof File
        ? file
        : new File([file], fileName, {
            type: (file as Blob).type || 'application/octet-stream',
          });

    // Compressão só de imagem (não figurinha/GIF animado).
    if (mediaType === 'image') {
      setUploadStatusText('Otimizando imagem…');
      setUploadProgress(null);
      asFile = await compressInternalChatImage(asFile);
    }

    setUploadStatusText(
      asFile.size < size && mediaType === 'image'
        ? 'Enviando imagem otimizada…'
        : 'Enviando arquivo…',
    );
    setUploadProgress(0);

    const url = await uploadInternalChatFile(asFile, (pct) => {
      setUploadProgress(pct);
    });

    setUploadStatusText('Finalizando…');
    await sendMessage({
      type: toApiType(mediaType),
      mediaUrl: url,
      mediaName: asFile.name || fileName,
      // APIs antigas esperam o nome do arquivo em `body` para FILE.
      body:
        caption?.trim() ||
        (mediaType === 'file' || mediaType === 'video'
          ? asFile.name || fileName
          : ''),
      replyToMessageId: replyingTo?.id ?? null,
    });
    if (mediaType === 'sticker') rememberSticker(url);
    setReplyingTo(null);
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
    if (valid.length) setFileQueue((prev) => [...prev, ...valid]);
  }, []);

  const resetUploadUi = () => {
    setUploading(false);
    setUploadProgress(null);
    setUploadStatusText(null);
  };

  const handleConfirmQueuedFile = async (file: File, caption: string) => {
    setUploading(true);
    setFileError(null);
    setUploadProgress(null);
    setUploadStatusText('Preparando…');
    try {
      const mediaType = detectMediaType(file.type, file.name);
      await uploadAndSendMedia(
        file,
        file.name || 'arquivo',
        mediaType,
        caption || null,
      );
      setFileQueue((q) => q.slice(1));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Falha ao enviar arquivo');
    } finally {
      resetUploadUi();
    }
  };

  const handleSendAudio = async (blob: Blob, fileName: string) => {
    setUploading(true);
    setUploadProgress(null);
    setUploadStatusText('Enviando áudio…');
    try {
      await uploadAndSendMedia(blob, fileName, 'audio', null);
    } finally {
      resetUploadUi();
    }
  };

  const handleSendSticker = async (file: File) => {
    setUploading(true);
    setUploadProgress(null);
    setUploadStatusText('Enviando figurinha…');
    try {
      await uploadAndSendMedia(
        file,
        file.name || 'sticker.webp',
        'sticker',
        null,
      );
    } finally {
      resetUploadUi();
    }
  };

  const handleSendStickerUrl = async (url: string) => {
    setUploading(true);
    setUploadProgress(null);
    setUploadStatusText('Enviando figurinha…');
    try {
      await sendMessage({
        type: 'STICKER',
        mediaUrl: url,
        mediaName: 'sticker.webp',
        body: '',
        replyToMessageId: replyingTo?.id ?? null,
      });
      rememberSticker(url);
      setReplyingTo(null);
    } finally {
      resetUploadUi();
    }
  };

  const handleEditMessage = async (message: Message, body: string) => {
    await editMessage(message.id, body);
  };

  const handleDeleteMessage = async (message: Message) => {
    await deleteMessage(message.id);
  };

  const handleWallpaperChange = async (id: string) => {
    if (!canEditWallpaper) return;
    const pref = { wallpaperKey: id, customImageUrl: null as string | null };
    writeLocalWallpaper(pref);
    setLocalWallpaper(pref);
    if (profile?.apiRole === 'ADMIN') {
      await updateAppearance({ wallpaperKey: id, customImageUrl: null });
    }
  };

  const handleCustomWallpaper = async (url: string) => {
    if (!canEditWallpaper) return;
    const pref = { wallpaperKey: 'custom', customImageUrl: url };
    writeLocalWallpaper(pref);
    setLocalWallpaper(pref);
    if (profile?.apiRole === 'ADMIN') {
      await updateAppearance({ wallpaperKey: 'custom', customImageUrl: url });
    }
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/plain')) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent) => {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const collected: File[] = [];
    if (e.dataTransfer.items?.length) {
      for (const item of Array.from(e.dataTransfer.items)) {
        if (item.kind !== 'file') continue;
        // Ignora pastas (só arquivos, como no WhatsApp)
        const entry = (
          item as DataTransferItem & {
            webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
          }
        ).webkitGetAsEntry?.();
        if (entry?.isDirectory) continue;
        const f = item.getAsFile();
        if (f) collected.push(f);
      }
    }
    if (!collected.length && e.dataTransfer.files?.length) {
      collected.push(...Array.from(e.dataTransfer.files));
    }
    // .txt no Chrome às vezes vira texto sem File — materializa como anexo
    if (!collected.length) {
      const plain = e.dataTransfer.getData('text/plain');
      if (plain?.trim()) {
        collected.push(
          new File([plain], 'mensagem.txt', { type: 'text/plain' }),
        );
      }
    }
    if (!collected.length) {
      setFileError('Solte arquivos (não pastas). Imagem, vídeo, áudio, PDF, TXT…');
      return;
    }
    enqueueFiles(collected);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const wallpaperStyle: CSSProperties | undefined = wallpaper.style;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 border-r border-ink-700 flex flex-col bg-ink-900 flex-shrink-0">
        <div className="p-3 border-b border-ink-700">
          <h2 className="text-sm font-bold text-white mb-2">Comunicador Interno</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar colega..."
              className="input pl-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-ink-300">
              <Users className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-xs">Nenhum usuário encontrado</p>
            </div>
          ) : (
            filtered.map((c) => {
              const key = c.kind === 'GENERAL' ? 'general' : `peer:${c.peer?.id}`;
              const isSelected =
                (selected?.kind === 'GENERAL' && c.kind === 'GENERAL') ||
                (selected?.peer?.id != null && selected.peer.id === c.peer?.id);
              const online =
                c.kind === 'GENERAL'
                  ? true
                  : c.peer
                    ? onlineUserIds.has(c.peer.id) || c.online
                    : false;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectConversation(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-ink-800/60 transition-colors ${
                    isSelected ? 'bg-brand-600/20' : 'hover:bg-ink-800'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {c.kind === 'GENERAL' ? (
                      <div className="w-11 h-11 rounded-full bg-brand-600/30 flex items-center justify-center">
                        <Users className="w-5 h-5 text-brand-300" />
                      </div>
                    ) : (
                      <ContactAvatar
                        name={c.title}
                        profilePicUrl={mediaUrl(c.peer?.avatarUrl)}
                        size="md"
                      />
                    )}
                    {c.kind === 'DIRECT' && (
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-ink-900 ${
                          online ? 'bg-emerald-500' : 'bg-ink-500'
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white truncate">{c.title}</p>
                      {c.unreadCount > 0 && (
                        <span className="badge bg-danger-500 text-white px-1.5 min-w-[18px] justify-center text-[10px]">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-400 truncate">{previewText(c.lastMessage)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {selected ? (
        <div
          className="flex-1 flex flex-col min-w-0 bg-ink-950 relative"
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {fileQueue[0] && (
            <MediaPreview
              file={fileQueue[0]}
              sending={uploading}
              uploadProgress={uploadProgress}
              uploadStatusText={uploadStatusText}
              remainingCount={fileQueue.length - 1}
              onCancel={() => !uploading && setFileQueue((q) => q.slice(1))}
              onSkip={() => !uploading && setFileQueue((q) => q.slice(1))}
              onCancelAll={() => !uploading && setFileQueue([])}
              onSend={(file, caption) => void handleConfirmQueuedFile(file, caption)}
            />
          )}

          {isDragging && (
            <div className="absolute inset-0 z-30 bg-brand-600/20 border-2 border-dashed border-brand-400 rounded-lg flex items-center justify-center pointer-events-none m-1">
              <div className="flex flex-col items-center gap-2 text-white bg-ink-900/90 px-6 py-4 rounded-xl shadow-xl">
                <Upload className="w-8 h-8 text-brand-400" />
                <p className="text-sm font-semibold">Solte os arquivos aqui</p>
                <p className="text-xs text-ink-300">Envio em lote — até 50 MB por arquivo</p>
              </div>
            </div>
          )}

          <div className="h-14 border-b border-ink-700 px-4 flex items-center gap-3 bg-ink-900">
            {selected.kind === 'GENERAL' ? (
              <div className="w-9 h-9 rounded-full bg-brand-600/30 flex items-center justify-center">
                <Users className="w-4 h-4 text-brand-300" />
              </div>
            ) : (
              <div className="relative">
                <ContactAvatar
                  name={selected.title}
                  profilePicUrl={mediaUrl(selected.peer?.avatarUrl)}
                  size="sm"
                />
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-ink-900 ${
                    selected.peer && (onlineUserIds.has(selected.peer.id) || selected.online)
                      ? 'bg-emerald-500'
                      : 'bg-ink-500'
                  }`}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{selected.title}</p>
              <p className="text-xs text-ink-400">
                {selected.kind === 'GENERAL'
                  ? 'Chat da equipe'
                  : selected.peer && (onlineUserIds.has(selected.peer.id) || selected.online)
                    ? 'Online'
                    : 'Offline'}
              </p>
            </div>
            {canEditWallpaper && (
              <button
                type="button"
                title="Papel de parede"
                onClick={() => setShowWallpaperPicker((v) => !v)}
                className={`btn-ghost p-1.5 ${showWallpaperPicker ? 'text-brand-400' : ''}`}
              >
                <ImageIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {canEditWallpaper && showWallpaperPicker && (
            <WallpaperPicker
              selectedId={wallpaperKey}
              customImageUrl={customImageUrl}
              saving={false}
              onSelect={(id) => void handleWallpaperChange(id)}
              onCustomUploaded={(url) => void handleCustomWallpaper(url)}
              onClose={() => setShowWallpaperPicker(false)}
            />
          )}

          <div
            ref={scrollRef}
            className={`flex-1 overflow-y-auto py-3 ${wallpaper.className}`}
            style={wallpaperStyle}
            onScroll={() => {
              const el = scrollRef.current;
              if (!el) return;
              const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
              stickToBottomRef.current = distance <= 120;
            }}
          >
            {messagesLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            ) : uiMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-ink-400">
                <MessageCircleMore className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Nenhuma mensagem ainda</p>
                <p className="text-xs mt-1">Envie a primeira mensagem para a equipe</p>
              </div>
            ) : (
              uiMessages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  contactName={
                    m.sender?.name ||
                    selected.peer?.name ||
                    selected.title
                  }
                  showSenderName={selected.kind === 'GENERAL'}
                  deleteTitle="Excluir mensagem"
                  onReply={setReplyingTo}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                />
              ))
            )}
            {typingLabel && (
              <p className="px-4 text-xs text-ink-400 italic py-1">{typingLabel}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {fileError && (
            <p className="px-3 py-1 text-xs text-danger-400 bg-ink-900">{fileError}</p>
          )}

          <div className="border-t border-ink-700 p-3 bg-ink-900">
            <MessageComposer
              contactName={selected.title}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              onSendText={handleSendText}
              onPickFiles={enqueueFiles}
              onSendAudio={handleSendAudio}
              onSendSticker={handleSendSticker}
              onSendStickerUrl={handleSendStickerUrl}
              recentStickers={mergedStickers}
              canned={canned}
              uploading={uploading}
              uploadProgress={uploadProgress}
              uploadStatusText={uploadStatusText}
              onTyping={(typing) => {
                emitTyping(typing);
                if (typingTimer.current) window.clearTimeout(typingTimer.current);
                if (typing) {
                  typingTimer.current = window.setTimeout(() => emitTyping(false), 1200);
                }
              }}
              placeholder="Mensagem interna… (use / para respostas rápidas)"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-ink-950">
          <div className="w-20 h-20 rounded-2xl bg-ink-800 flex items-center justify-center mx-auto mb-4">
            <MessageCircleMore className="w-10 h-10 text-ink-600" />
          </div>
          <h3 className="text-lg font-semibold text-ink-200 mb-1">Selecione uma conversa</h3>
          <p className="text-sm text-ink-300">Grupo geral ou chat privado com um colega</p>
        </div>
      )}
    </div>
  );
}
