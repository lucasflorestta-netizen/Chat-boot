import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Loader2,
  MessageCircleMore,
  Paperclip,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { mediaUrl, uploadFile } from '../../lib/api';
import {
  useInternalChat,
  type InternalChatMessage,
  type InternalConversationItem,
} from '../../hooks/useInternalChat';
import { ContactAvatar } from '../ContactAvatar';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import { detectMediaType, MAX_UPLOAD_BYTES } from '../chat/messageUtils';

function previewText(msg: InternalConversationItem['lastMessage']): string {
  if (!msg) return 'Nenhuma mensagem ainda';
  if (msg.body?.trim()) {
    const t = msg.body.trim();
    return t.length > 40 ? `${t.slice(0, 40)}…` : t;
  }
  if (msg.type === 'IMAGE') return 'Enviou uma imagem';
  if (msg.type === 'AUDIO') return 'Enviou um áudio';
  return 'Nova mensagem';
}

function InternalBubble({
  message,
  mine,
}: {
  message: InternalChatMessage;
  mine: boolean;
}) {
  const url = mediaUrl(message.mediaUrl);
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} my-1 px-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 ${
          mine
            ? 'bg-brand-600 text-white rounded-br-md'
            : 'bg-ink-800 text-ink-100 rounded-bl-md border border-ink-700'
        } ${message._failed ? 'opacity-60' : ''} ${message._optimistic ? 'opacity-80' : ''}`}
      >
        {!mine && message.sender && (
          <p className="text-[11px] font-semibold text-brand-300 mb-0.5">
            {message.sender.name?.trim() || message.sender.username}
          </p>
        )}
        {message.type === 'IMAGE' && url && (
          <a href={url} target="_blank" rel="noreferrer" className="block mb-1">
            <img src={url} alt="" className="rounded-lg max-h-56 object-cover" />
          </a>
        )}
        {message.type === 'AUDIO' && url && (
          <audio controls src={url} className="w-56 max-w-full my-1" />
        )}
        {message.body?.trim() && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
        )}
        <span
          className={`text-[10px] mt-1 block ${mine ? 'text-white/70' : 'text-ink-400'}`}
        >
          {new Date(message.createdAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {message._failed ? ' · falhou' : ''}
        </span>
      </div>
    </div>
  );
}

export function InternalChatView() {
  const { profile } = useAuth();
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
    emitTyping,
  } = useInternalChat(profile?.id);

  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingUserIds.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const typingLabel = useMemo(() => {
    if (!typingUserIds.length || !selected) return null;
    const names = typingUserIds.map((id) => {
      const peer = conversations.find((c) => c.peer?.id === id)?.peer;
      return peer?.name?.trim() || peer?.username || 'Alguém';
    });
    if (names.length === 1) return `${names[0]} está digitando…`;
    return 'Várias pessoas estão digitando…';
  }, [typingUserIds, selected, conversations]);

  const handleInputChange = (value: string) => {
    setInput(value);
    emitTyping(true);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => emitTyping(false), 1200);
  };

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setInput('');
    emitTyping(false);
    try {
      await sendMessage({ body, type: 'TEXT' });
    } catch {
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  const uploadAndSend = async (file: File, type: 'IMAGE' | 'AUDIO') => {
    if (file.size > MAX_UPLOAD_BYTES) {
      alert('Arquivo muito grande');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file);
      await sendMessage({
        type,
        mediaUrl: url,
        body: type === 'IMAGE' ? '' : '',
      });
    } finally {
      setUploading(false);
    }
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const kind = detectMediaType(file.type);
    if (kind === 'image') void uploadAndSend(file, 'IMAGE');
    else if (kind === 'audio') void uploadAndSend(file, 'AUDIO');
    else alert('Envie apenas imagem ou áudio no comunicador interno');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

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
        <div className="flex-1 flex flex-col min-w-0 bg-ink-950">
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
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{selected.title}</p>
              <p className="text-xs text-ink-400">
                {selected.kind === 'GENERAL'
                  ? 'Chat da equipe'
                  : selected.peer && (onlineUserIds.has(selected.peer.id) || selected.online)
                    ? 'Online'
                    : 'Offline'}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-3">
            {messagesLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-ink-400">
                <MessageCircleMore className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Nenhuma mensagem ainda</p>
                <p className="text-xs mt-1">Envie a primeira mensagem para a equipe</p>
              </div>
            ) : (
              messages.map((m) => (
                <InternalBubble
                  key={m.id}
                  message={m}
                  mine={m.senderId === profile?.id}
                />
              ))
            )}
            {typingLabel && (
              <p className="px-4 text-xs text-ink-400 italic py-1">{typingLabel}</p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-ink-700 p-3 bg-ink-900">
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn-ghost p-2"
                title="Anexar imagem"
                disabled={uploading || sending}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </button>
              <button
                type="button"
                className="btn-ghost p-2"
                title="Imagem"
                disabled={uploading || sending}
                onClick={() => fileRef.current?.click()}
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <VoiceRecorder
                disabled={uploading || sending}
                onRecorded={(blob, fileName) => {
                  const file = new File([blob], fileName, {
                    type: blob.type || 'audio/webm',
                  });
                  void uploadAndSend(file, 'AUDIO');
                }}
              />
              <textarea
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
                placeholder="Mensagem para a equipe…"
                className="input flex-1 resize-none text-sm min-h-[40px] max-h-28"
              />
              <button
                type="button"
                className="btn-primary p-2.5"
                disabled={!input.trim() || sending}
                onClick={() => void handleSend()}
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
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
