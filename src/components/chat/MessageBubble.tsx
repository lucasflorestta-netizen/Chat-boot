import { useState } from 'react';
import {
  FileText,
  Paperclip,
  Reply,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import type { Message } from '../../types';
import { FormattedText } from './FormattedText';
import { MessageStatus } from './MessageStatus';
import { replyAuthorLabel, replySnippet } from './messageUtils';

interface MessageBubbleProps {
  message: Message;
  contactName?: string | null;
  onReply?: (message: Message) => void;
}

export function MessageBubble({ message, contactName, onReply }: MessageBubbleProps) {
  const isClient = message.sender_type === 'client';
  const isNote = message.media_type === 'note';
  const isSystem = message.sender_type === 'system' || message.sender_type === 'bot';
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const canReply = Boolean(onReply) && !isNote && !isSystem && !message._localStatus;

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
          <FormattedText
            text={message.body || ''}
            className="text-xs text-ink-200 text-center whitespace-pre-wrap break-words"
          />
        </div>
      </div>
    );
  }

  const handleReplyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReply?.(message);
  };

  return (
    <>
      <div
        className={`flex ${isClient ? 'justify-start' : 'justify-end'} group/row`}
        onDoubleClick={() => canReply && onReply?.(message)}
      >
        <div className={`relative flex items-center gap-1 max-w-[85%] ${isClient ? 'flex-row' : 'flex-row-reverse'}`}>
          {canReply && (
            <button
              type="button"
              onClick={handleReplyClick}
              className="opacity-0 group-hover/row:opacity-100 transition-opacity btn-ghost p-1.5 rounded-full bg-ink-800/80 border border-ink-600 shrink-0"
              title="Responder"
              aria-label="Responder"
            >
              <Reply className="w-3.5 h-3.5 text-ink-200" />
            </button>
          )}

          <div
            className={`max-w-full ${isClient ? 'bg-ink-700' : 'bg-brand-600'} rounded-2xl p-3 group relative ${
              message._localStatus === 'failed' ? 'opacity-70 ring-1 ring-danger-400/50' : ''
            }`}
          >
            <div
              className={`absolute top-0 ${isClient ? '-left-1' : '-right-1'} w-3 h-3 ${
                isClient ? 'bg-ink-700' : 'bg-brand-600'
              } rounded-tr-lg rounded-bl-lg`}
            />

            {message.reply_to && (
              <div
                className={`mb-2 rounded-md px-2 py-1.5 border-l-2 ${
                  isClient ? 'bg-ink-800/80 border-brand-400' : 'bg-black/20 border-white/70'
                }`}
              >
                <p className={`text-[11px] font-semibold truncate ${isClient ? 'text-brand-400' : 'text-white/90'}`}>
                  {replyAuthorLabel(message.reply_to, contactName)}
                </p>
                <p className={`text-[11px] truncate ${isClient ? 'text-ink-200' : 'text-white/70'}`}>
                  {replySnippet(message.reply_to)}
                </p>
              </div>
            )}

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
                  <button
                    type="button"
                    className="block mb-2 max-w-full"
                    onClick={() => setLightboxUrl(message.media_url)}
                  >
                    <img
                      src={message.media_url}
                      alt={message.media_name || ''}
                      className="rounded-lg max-w-full max-h-72 object-cover cursor-zoom-in"
                    />
                  </button>
                )}
                {message.media_type === 'sticker' && message.media_url && (
                  <img src={message.media_url} alt="Sticker" className="mb-2 max-w-[160px]" />
                )}
                {message.media_type === 'audio' && message.media_url && (
                  <audio controls src={message.media_url} className="w-full min-w-[220px] mb-2" />
                )}
                {message.media_type === 'video' && message.media_url && (
                  <video controls src={message.media_url} className="rounded-lg mb-2 max-w-full max-h-72" />
                )}
                {message.media_type === 'file' && message.media_url && (
                  <a
                    href={message.media_url}
                    download={message.media_name || ''}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-3 mb-2 rounded-lg p-2.5 ${
                      isClient ? 'bg-ink-800/80' : 'bg-black/15'
                    } hover:opacity-90`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      {isPdf(message.media_name) ? (
                        <FileText className="w-5 h-5 text-danger-300" />
                      ) : (
                        <Paperclip className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{message.media_name || 'Arquivo'}</p>
                      <p className="text-[10px] text-white/60">Toque para baixar</p>
                    </div>
                  </a>
                )}
                {message.body && (
                  <FormattedText
                    text={message.body}
                    className="text-sm text-white whitespace-pre-wrap break-words"
                  />
                )}
              </>
            )}

            <div className="flex items-center gap-1 mt-0.5">
              {!isClient && message.sender && (
                <span className="text-[10px] text-white/60">{message.sender.name}</span>
              )}
              <span className="text-[10px] text-white/50 ml-auto flex items-center gap-1">
                {new Date(message.created_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {!isClient && (
                  <MessageStatus
                    localStatus={message._localStatus}
                    whatsappDelivered={message.whatsapp_delivered}
                  />
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 btn-ghost p-2 bg-ink-800/80 rounded-full"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function isPdf(name: string | null | undefined): boolean {
  return Boolean(name?.toLowerCase().endsWith('.pdf'));
}
