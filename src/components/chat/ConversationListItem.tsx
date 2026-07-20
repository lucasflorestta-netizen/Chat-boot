import type { Ticket, TicketLastMessage } from '../../types';
import { ContactAvatar } from '../ContactAvatar';

interface ConversationListItemProps {
  ticket: Ticket;
  isSelected: boolean;
  onClick: () => void;
  onTagClick: (tagId: string) => void;
}

function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfMsg.getTime()) / 86_400_000,
  );

  if (dayDiff === 0) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Ontem';
  if (dayDiff < 7) {
    return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function previewText(msg: TicketLastMessage | null | undefined): string {
  if (!msg) return '';
  if (msg.deleted_by_client) return 'Mensagem apagada';
  if (msg.deleted_for_client) return 'Mensagem apagada';
  const body = msg.body?.trim();
  if (body) return body;
  switch (msg.media_type) {
    case 'image':
      return 'Foto';
    case 'audio':
      return 'Áudio';
    case 'video':
      return 'Vídeo';
    case 'sticker':
      return 'Figurinha';
    case 'note':
      return 'Nota interna';
    case 'file':
      return 'Arquivo';
    default:
      return '';
  }
}

export function ConversationListItem({
  ticket,
  isSelected,
  onClick,
  onTagClick,
}: ConversationListItemProps) {
  const photo = ticket.contact?.profile_pic_url ?? null;
  const statusDot =
    ticket.status === 'triage'
      ? 'bg-warning-500'
      : ticket.status === 'attending'
        ? 'bg-brand-500'
        : 'bg-ink-500';

  const timeSource = ticket.last_message?.created_at ?? ticket.last_message_at;
  const preview = previewText(ticket.last_message);
  const unread = ticket.unread_count > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-ink-700/50 text-left transition-colors ${
        isSelected ? 'bg-brand-600/15 border-l-2 border-l-brand-500' : 'hover:bg-ink-800'
      }`}
    >
      <div className="relative flex-shrink-0">
        <ContactAvatar name={ticket.contact?.name} profilePicUrl={photo} size="md" />
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${statusDot} rounded-full border-2 border-ink-900`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-sm truncate ${
              unread ? 'font-semibold text-white' : 'font-medium text-white'
            }`}
          >
            {ticket.contact?.name ?? 'Unknown'}
          </p>
          <span
            className={`text-[11px] flex-shrink-0 tabular-nums ${
              unread ? 'text-success-400 font-medium' : 'text-ink-400'
            }`}
          >
            {formatChatTime(timeSource)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={`text-xs truncate ${
              unread ? 'text-ink-200' : 'text-ink-400'
            }`}
          >
            {preview || '\u00A0'}
          </p>
          {unread && (
            <span className="badge bg-success-500 text-white justify-center min-w-[18px] h-[18px] text-[10px] flex-shrink-0 rounded-full px-1">
              {ticket.unread_count}
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
