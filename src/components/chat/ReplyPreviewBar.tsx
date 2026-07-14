import { X, Image as ImageIcon, FileText, Film, Music } from 'lucide-react';
import type { Message } from '../../types';
import { replyAuthorLabel, replySnippet } from './messageUtils';

interface ReplyPreviewBarProps {
  message: Message;
  contactName?: string | null;
  onCancel: () => void;
}

export function ReplyPreviewBar({ message, contactName, onCancel }: ReplyPreviewBarProps) {
  const author = replyAuthorLabel(message, contactName);
  const snippet = replySnippet(message);
  const Icon = mediaIcon(message.media_type);

  return (
    <div className="mb-2 flex items-stretch gap-2 rounded-lg bg-ink-800 border border-ink-600 overflow-hidden">
      <div className="w-1 bg-brand-400 flex-shrink-0" />
      <div className="flex-1 min-w-0 py-2 pr-1">
        <p className="text-xs font-semibold text-brand-400 truncate">{author}</p>
        <p className="text-xs text-ink-200 truncate flex items-center gap-1">
          {message.media_type !== 'text' && !message.body?.trim() && (
            <Icon className="w-3 h-3 flex-shrink-0 text-ink-300" />
          )}
          <span className="truncate">{snippet}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="btn-ghost p-2 self-center rounded-md"
        title="Cancelar resposta"
        aria-label="Cancelar resposta"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function mediaIcon(mediaType: string) {
  switch (mediaType) {
    case 'image':
    case 'sticker':
      return ImageIcon;
    case 'video':
      return Film;
    case 'audio':
      return Music;
    default:
      return FileText;
  }
}
