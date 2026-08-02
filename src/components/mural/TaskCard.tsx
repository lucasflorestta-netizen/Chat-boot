import { useEffect, useRef } from 'react';
import { CalendarDays, Check, Clock, Link2 } from 'lucide-react';
import { ContactAvatar } from '../ContactAvatar';
import type { MuralTask, MuralTaskPriority } from '../../types';

const SNOOZE_OPTIONS: { preset: '15m' | '1h' | 'tomorrow' | 'custom'; label: string }[] =
  [
    { preset: '15m', label: '15 min' },
    { preset: '1h', label: '1 hora' },
    { preset: 'tomorrow', label: 'Amanhã' },
    { preset: 'custom', label: 'Escolher data' },
  ];

function toLocalInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function dayLabel(due: Date, now = new Date()): string {
  const dueDay = due.toLocaleDateString('en-CA');
  const today = now.toLocaleDateString('en-CA');
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toLocaleDateString('en-CA');
  if (dueDay === today) return 'Hoje';
  if (dueDay === tomorrowKey) return 'Amanhã';
  return due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatDueHeader(iso: string): string {
  try {
    const due = new Date(iso);
    const time = due.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const full = due.toLocaleDateString('pt-BR');
    return `${dayLabel(due)} • ${time} — ${full}`;
  } catch {
    return iso;
  }
}

function priorityMeta(priority?: MuralTaskPriority | null) {
  switch (priority) {
    case 'URGENT':
      return { label: 'Urgente', dot: 'bg-red-500' };
    case 'HIGH':
      return { label: 'Alta', dot: 'bg-orange-500' };
    case 'LOW':
      return { label: 'Baixa', dot: 'bg-blue-500' };
    case 'MEDIUM':
    default:
      return { label: 'Média', dot: 'bg-yellow-400' };
  }
}

function clienteNome(task: MuralTask): string {
  return (
    task.clienteNome ||
    task.cliente_nome ||
    task.ticket?.contact?.displayName ||
    'Cliente'
  );
}

function conversaId(task: MuralTask): string {
  return task.conversaId || task.conversa_id || task.ticketId;
}

function taskTitulo(task: MuralTask): string {
  return task.body.split(/\r?\n/).filter(Boolean)[0] || task.body || 'Sem título';
}

function notaPreview(task: MuralTask): string {
  const fromApi =
    task.notaInternaPreview || task.nota_interna_preview || '';
  if (fromApi.trim()) return fromApi.trim();
  const lines = task.body.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).join(' ') || lines[0] || '';
}

function assigneeOf(task: MuralTask) {
  return task.atribuidoPara || task.atribuido_para || task.assignedTo || null;
}

function WhatsAppIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export interface TaskCardProps {
  task: MuralTask;
  busy?: boolean;
  isMine?: boolean;
  snoozeOpen?: boolean;
  customSnoozeOpen?: boolean;
  customDueAt?: string;
  onCustomDueAtChange?: (value: string) => void;
  onToggleSnooze?: () => void;
  onCloseSnooze?: () => void;
  onComplete?: () => void;
  onSnooze?: (preset: '15m' | '1h' | 'tomorrow' | 'custom', customIso?: string) => void;
  onOpenCustomSnooze?: (defaultValue: string) => void;
  onCancelCustomSnooze?: () => void;
  onAccept?: () => void;
  onOpenConversation?: () => void;
  snoozeMenuRef?: (el: HTMLDivElement | null) => void;
}

export function TaskCard({
  task,
  busy,
  isMine,
  snoozeOpen,
  customSnoozeOpen,
  customDueAt = '',
  onCustomDueAtChange,
  onToggleSnooze,
  onComplete,
  onSnooze,
  onOpenCustomSnooze,
  onCancelCustomSnooze,
  onAccept,
  onOpenConversation,
  snoozeMenuRef,
}: TaskCardProps) {
  const overdue =
    task.status === 'PENDING' && new Date(task.dueAt) < new Date();
  const unread =
    !!task.notifiedAt && !task.reminderReadAt && task.status === 'PENDING';
  const showLembrete = unread || !!task.internalMessageId;
  const assignee = assigneeOf(task);
  const priority = priorityMeta(task.priority || task.prioridade);
  const protocol = task.ticket?.protocolo || conversaId(task).slice(0, 8);
  const client = clienteNome(task);
  const titulo = taskTitulo(task);
  const preview = notaPreview(task);
  const localSnoozeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!snoozeMenuRef) return;
    snoozeMenuRef(localSnoozeRef.current);
    return () => snoozeMenuRef(null);
  }, [snoozeMenuRef, snoozeOpen]);

  return (
    <div
      className={`w-full md:w-[calc(50%-16px)] lg:w-[calc(33.333%-16px)] max-w-[380px] self-start h-fit min-h-fit max-h-[260px] overflow-hidden rounded-xl border p-4 flex flex-col bg-[#151A27] border-[#1E293B] transition-colors ${
        unread ? 'ring-1 ring-brand-500/40' : 'hover:border-ink-600'
      }`}
      style={{ alignSelf: 'flex-start', height: 'fit-content' }}
    >
      {/* Linha 1: data + badges + ações */}
      <div className="flex items-start gap-2 min-w-0">
        <CalendarDays
          className={`w-4 h-4 shrink-0 mt-0.5 ${
            overdue ? 'text-red-400' : 'text-ink-300'
          }`}
        />
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-300 truncate">
            {formatDueHeader(task.dueAt)}
          </span>
          {overdue && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-900/50 text-red-300">
              ! Atrasada
            </span>
          )}
          {showLembrete && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-900/50 text-blue-300">
              Lembrete
            </span>
          )}
          {task.status === 'DONE' && (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-900/50 text-emerald-300">
              Concluída
            </span>
          )}
        </div>
        {task.status === 'PENDING' && (
          <div className="flex items-center gap-0.5 shrink-0 -mt-1">
            <button
              type="button"
              title="Concluir"
              disabled={busy}
              onClick={onComplete}
              className="p-1.5 rounded-md text-emerald-400 hover:bg-ink-800 disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
            </button>
            <div className="relative" ref={localSnoozeRef}>
              <button
                type="button"
                title="Adiar"
                disabled={busy}
                onClick={onToggleSnooze}
                className="p-1.5 rounded-md text-ink-300 hover:text-brand-300 hover:bg-ink-800 disabled:opacity-40"
              >
                <Clock className="w-4 h-4" />
              </button>
              {snoozeOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-[#1E293B] bg-[#151A27] shadow-xl py-1">
                  {SNOOZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.preset}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs text-ink-100 hover:bg-ink-800"
                      onClick={() => {
                        if (opt.preset === 'custom') {
                          const def = new Date();
                          def.setHours(def.getHours() + 2);
                          onOpenCustomSnooze?.(toLocalInputValue(def));
                        } else {
                          onSnooze?.(opt.preset);
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <h3 className="mt-2 text-base font-bold text-white truncate" title={titulo}>
        {titulo}
      </h3>

      <div className="mt-2 space-y-1 text-xs text-ink-300 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[#25D366] shrink-0">
            <WhatsAppIcon />
          </span>
          <span className="truncate">
            Cliente: <span className="text-ink-100">{client}</span>
          </span>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 min-w-0 text-left w-full hover:opacity-90"
          onClick={onOpenConversation}
        >
          <Link2 className="w-3.5 h-3.5 text-ink-400 shrink-0" />
          <span className="truncate">
            Origem: Conversa #{protocol} •{' '}
            <span className="text-blue-400">{client}</span>
          </span>
        </button>
        <div className="flex items-center gap-1.5 min-w-0">
          <ContactAvatar
            name={assignee?.name}
            profilePicUrl={assignee?.avatarUrl}
            size="sm"
            className="!w-5 !h-5 !text-[10px] shrink-0"
          />
          <span className="truncate">
            Atribuído a:{' '}
            <span className="text-ink-100">{assignee?.name || '—'}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${priority.dot}`} />
          <span>
            Prioridade: <span className="text-ink-100">{priority.label}</span>
          </span>
        </div>
      </div>

      <div
        className="mt-3 rounded border p-2 min-w-0"
        style={{ background: '#151A27', borderColor: '#2A3245' }}
      >
        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">
          Nota interna (preview)
        </p>
        <p className="text-xs text-ink-200 truncate" title={preview}>
          {preview || '—'}
        </p>
        <div className="mt-2 flex items-center justify-end gap-2">
          {task.status === 'PENDING' && !isMine && (
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="text-[11px] px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
            >
              Aceitar
            </button>
          )}
          <button
            type="button"
            onClick={onOpenConversation}
            className="text-[11px] px-2.5 py-1 rounded-md border border-[#2A3245] text-ink-100 hover:border-ink-500 bg-transparent"
          >
            Abrir conversa
          </button>
        </div>
      </div>

      {customSnoozeOpen && (
        <div className="mt-2 rounded-lg border border-[#1E293B] bg-[#0B0E14] p-2 space-y-2">
          <input
            type="datetime-local"
            value={customDueAt}
            onChange={(e) => onCustomDueAtChange?.(e.target.value)}
            className="input text-xs"
          />
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white disabled:opacity-40"
              disabled={!customDueAt || busy}
              onClick={() =>
                onSnooze?.('custom', new Date(customDueAt).toISOString())
              }
            >
              Confirmar
            </button>
            <button
              type="button"
              className="text-[11px] px-2 py-1 text-ink-300"
              onClick={onCancelCustomSnooze}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Alias pedido pelo mockup. */
export { TaskCard as MuralCard };
