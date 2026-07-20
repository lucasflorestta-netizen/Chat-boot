import type { ReactNode } from 'react';
import type { Ticket } from '../../types';
import { departmentLabel } from '../../lib/mappers';
import { ContactAvatar } from '../ContactAvatar';
import { UserCheck } from 'lucide-react';

interface ChatHeaderProps {
  ticket: Ticket;
  /** Show "Assumir atendimento" in the top bar (unassigned open ticket). */
  showAssume?: boolean;
  onAssume?: () => void;
  actions?: ReactNode;
  extras?: ReactNode;
}

export function ChatHeader({
  ticket,
  showAssume,
  onAssume,
  actions,
  extras,
}: ChatHeaderProps) {
  const photo = ticket.contact?.profile_pic_url ?? null;

  return (
    <div className="p-3 border-b border-ink-700 bg-ink-900 flex items-center gap-3 relative">
      <div className="relative flex-shrink-0">
        <ContactAvatar
          name={ticket.contact?.name}
          profilePicUrl={photo}
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
        <p className="text-xs text-ink-300 flex items-center gap-1.5 flex-wrap">
          {ticket.contact?.phone}
          <span className="text-ink-500">·</span>
          <span className="text-brand-400">{departmentLabel(ticket.department)}</span>
          {ticket.assigned_agent && (
            <>
              <span className="text-ink-500">·</span>
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <ContactAvatar
                  name={ticket.assigned_agent.name}
                  profilePicUrl={ticket.assigned_agent.avatar_url}
                  size="sm"
                  className="!w-4 !h-4 !text-[8px]"
                />
                <span className="truncate">{ticket.assigned_agent.name}</span>
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {showAssume && onAssume && (
          <button
            type="button"
            onClick={onAssume}
            className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Assumir atendimento
          </button>
        )}
        {actions}
      </div>
      {extras}
    </div>
  );
}
