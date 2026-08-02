import { Bell, CalendarDays, ExternalLink, LayoutGrid, X } from 'lucide-react';
import { ContactAvatar } from '../ContactAvatar';
import type { MuralReminderPayload } from '../../lib/muralReminders';

export type MuralReminderPopup = MuralReminderPayload & {
  dueAt?: string | Date | null;
};

interface MuralReminderModalProps {
  reminder: MuralReminderPopup;
  onClose: () => void;
  onOpenConversation: () => void;
  onOpenMural: () => void;
}

function formatDue(dueAt?: string | Date | null): string {
  if (!dueAt) return 'Agora';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return 'Agora';
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MuralReminderModal({
  reminder,
  onClose,
  onOpenConversation,
  onOpenMural,
}: MuralReminderModalProps) {
  const client = reminder.contactName?.trim() || 'Cliente';
  const body = reminder.body?.trim() || 'Lembrete de tarefa';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mural-reminder-title"
        className="w-full max-w-[380px] rounded-xl border border-[#1E293B] bg-[#151A27] p-4 shadow-2xl ring-1 ring-amber-400/30"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p
                id="mural-reminder-title"
                className="text-sm font-semibold text-white"
              >
                Lembrete do Mural
              </p>
              <p className="text-[11px] text-ink-300 flex items-center gap-1 mt-0.5">
                <CalendarDays className="h-3 w-3 shrink-0" />
                {formatDue(reminder.dueAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 min-w-0">
          <ContactAvatar
            name={client}
            profilePicUrl={reminder.avatarUrl}
            size="sm"
            className="!h-8 !w-8 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs text-ink-400">Cliente</p>
            <p className="text-sm font-medium text-white truncate">{client}</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2.5">
          <p className="text-sm text-ink-100 whitespace-pre-wrap break-words leading-relaxed">
            {body}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {reminder.ticketId ? (
            <button
              type="button"
              onClick={onOpenConversation}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir conversa
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenMural}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
              reminder.ticketId
                ? 'bg-ink-700 hover:bg-ink-600 text-ink-100'
                : 'flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Ver no Mural
          </button>
        </div>
      </div>
    </div>
  );
}
