import type { Ticket } from '../../types';
import { departmentLabel } from '../../lib/mappers';
import { ContactAvatar } from '../ContactAvatar';

interface ConversationListItemProps {
  ticket: Ticket;
  isSelected: boolean;
  onClick: () => void;
  onTagClick: (tagId: string) => void;
}

export function ConversationListItem({
  ticket,
  isSelected,
  onClick,
  onTagClick,
}: ConversationListItemProps) {
  const photo = ticket.contact?.profile_pic_url ?? null;
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
        <ContactAvatar name={ticket.contact?.name} profilePicUrl={photo} size="md" />
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
