import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardList, Loader2, Search } from 'lucide-react';
import { CriarTarefaModal } from '../mural/CriarTarefaModal';
import { TaskCard } from '../mural/TaskCard';
import { useAuth } from '../../context/useAuth';
import { api } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import type { MuralTask } from '../../types';

type QuickChip = 'today' | 'tomorrow' | 'week' | 'overdue' | 'all';

const QUICK_CHIPS: { id: QuickChip; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'tomorrow', label: 'Amanhã' },
  { id: 'week', label: 'Esta Semana' },
  { id: 'overdue', label: 'Atrasadas' },
  { id: 'all', label: 'Todas' },
];

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface MuralViewProps {
  onOpenTicket?: (ticketId: string) => void;
}

export function MuralView({ onOpenTicket }: MuralViewProps) {
  const { profile } = useAuth();
  const canSeeTeam =
    profile?.apiRole === 'ADMIN' ||
    profile?.apiRole === 'SUPERVISOR' ||
    profile?.role === 'admin';

  const [day, setDay] = useState(todayKey);
  const [status, setStatus] = useState<'PENDING' | 'DONE' | 'ALL'>('PENDING');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [preset, setPreset] = useState<QuickChip>('today');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<MuralTask[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    done: 0,
    overdue: 0,
    unreadReminders: 0,
    scheduledToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
  const [customSnoozeId, setCustomSnoozeId] = useState<string | null>(null);
  const [customDueAt, setCustomDueAt] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const snoozeRef = useRef<HTMLDivElement | null>(null);
  const canCreateTask =
    profile?.apiRole === 'ADMIN' ||
    profile?.apiRole === 'SUPERVISOR' ||
    profile?.role === 'admin';

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!snoozeRef.current?.contains(e.target as Node)) {
        setSnoozeOpenId(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        scope: canSeeTeam ? scope : 'mine',
        preset,
      });
      if (preset === 'today') params.set('day', day);
      if (search) params.set('q', search);
      const res = await api<{
        items: MuralTask[];
        counts: {
          pending: number;
          done: number;
          overdue: number;
          unreadReminders: number;
          scheduledToday?: number;
        };
      }>(`/mural/tasks?${params.toString()}`);
      setItems(res.items ?? []);
      setCounts({
        pending: res.counts?.pending ?? 0,
        done: res.counts?.done ?? 0,
        overdue: res.counts?.overdue ?? 0,
        unreadReminders: res.counts?.unreadReminders ?? 0,
        scheduledToday: res.counts?.scheduledToday ?? 0,
      });
      if ((res.counts?.unreadReminders ?? 0) > 0) {
        void api('/mural/reminders/read', {
          method: 'POST',
          body: JSON.stringify({ all: true }),
        });
      }
    } catch (err) {
      console.error('Erro ao carregar mural:', err);
    } finally {
      setLoading(false);
    }
  }, [day, status, scope, search, canSeeTeam, preset]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const socket = connectSocket();
    const refresh = () => {
      void fetchTasks();
    };
    socket.on('mural.task.created', refresh);
    socket.on('mural.task.updated', refresh);
    socket.on('mural.reminder', refresh);
    return () => {
      socket.off('mural.task.created', refresh);
      socket.off('mural.task.updated', refresh);
      socket.off('mural.reminder', refresh);
    };
  }, [fetchTasks]);

  const handleComplete = async (id: string) => {
    setBusyId(id);
    try {
      await api(`/mural/tasks/${id}/complete`, { method: 'POST' });
      await fetchTasks();
    } finally {
      setBusyId(null);
    }
  };

  const handleAccept = async (id: string) => {
    setBusyId(id);
    try {
      await api(`/mural/${id}/aceitar`, { method: 'PUT' });
      setScope('mine');
      await fetchTasks();
    } finally {
      setBusyId(null);
    }
  };

  const handleSnooze = async (
    id: string,
    presetOpt: '15m' | '1h' | 'tomorrow' | 'custom',
    customIso?: string,
  ) => {
    setBusyId(id);
    setSnoozeOpenId(null);
    try {
      const body =
        presetOpt === 'custom'
          ? { preset: 'custom', dueAt: customIso }
          : { preset: presetOpt };
      await api(`/mural/tasks/${id}/snooze`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCustomSnoozeId(null);
      await fetchTasks();
    } finally {
      setBusyId(null);
    }
  };

  const openConversation = (task: MuralTask) => {
    onOpenTicket?.(task.conversaId || task.conversa_id || task.ticketId);
  };

  const subtitle = useMemo(() => {
    const parts = [`${counts.pending} pendente(s)`];
    if (counts.overdue) parts.push(`${counts.overdue} atrasada(s)`);
    if (counts.done) parts.push(`${counts.done} concluída(s)`);
    return parts.join(' · ');
  }, [counts]);

  return (
    <div className="p-6 space-y-4 h-full overflow-y-auto bg-[#0B0E14]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-brand-400" />
            Mural
          </h2>
          <p className="text-sm text-ink-300">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value || todayKey());
              setPreset('today');
            }}
            className="input w-auto text-sm"
          />
          <select
            value={status}
            onChange={(e) => {
              const next = e.target.value as typeof status;
              setStatus(next);
              // Concluídas/Todas com chip "Hoje" escondiam itens de dias anteriores
              // (filtro por dueAt). Abre em "Todas" para não parecer que sumiram.
              if (next === 'DONE' || next === 'ALL') {
                setPreset('all');
              } else if (next === 'PENDING' && preset === 'all') {
                setPreset('today');
                setDay(todayKey());
              }
            }}
            className="input w-auto text-sm"
          >
            <option value="PENDING">Pendentes</option>
            <option value="DONE">Concluídas</option>
            <option value="ALL">Todas</option>
          </select>
          {canSeeTeam && (
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
              className="input w-auto text-sm"
            >
              <option value="mine">Minhas</option>
              <option value="all">Todas da equipe</option>
            </select>
          )}
          {canCreateTask && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              + Nova Tarefa
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[80] rounded-lg bg-emerald-600 text-white text-sm px-4 py-2.5 shadow-xl animate-fade-in">
          {toast}
        </div>
      )}

      <CriarTarefaModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setToast('Tarefa criada');
          setPreset('today');
          setDay(todayKey());
          setStatus('PENDING');
          void fetchTasks();
        }}
      />

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input pl-9"
          placeholder="Filtrar por texto da tarefa..."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_CHIPS.map((chip) => {
          const active = preset === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setPreset(chip.id);
                if (chip.id === 'today') setDay(todayKey());
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-[#3B82F6] border-[#3B82F6] text-white'
                  : 'bg-ink-850 border-ink-700 text-ink-200 hover:border-ink-500'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {counts.scheduledToday > 0 && (
        <div className="rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/40 px-4 py-3 text-sm text-brand-100 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#3B82F6] shrink-0" />
          <span>
            <strong className="text-white">{counts.scheduledToday}</strong>{' '}
            {counts.scheduledToday === 1
              ? 'tarefa agendada da anotação interna para hoje'
              : 'tarefas agendadas da anotação interna para hoje'}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 items-start justify-start content-start">
            {items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                busy={busyId === task.id}
                isMine={!!profile && task.assignedToId === profile.id}
                snoozeOpen={snoozeOpenId === task.id}
                customSnoozeOpen={customSnoozeId === task.id}
                customDueAt={customDueAt}
                onCustomDueAtChange={setCustomDueAt}
                snoozeMenuRef={
                  snoozeOpenId === task.id
                    ? (el) => {
                        snoozeRef.current = el;
                      }
                    : undefined
                }
                onToggleSnooze={() =>
                  setSnoozeOpenId((cur) => (cur === task.id ? null : task.id))
                }
                onComplete={() => void handleComplete(task.id)}
                onSnooze={(presetOpt, customIso) =>
                  void handleSnooze(task.id, presetOpt, customIso)
                }
                onOpenCustomSnooze={(value) => {
                  setCustomDueAt(value);
                  setCustomSnoozeId(task.id);
                  setSnoozeOpenId(null);
                }}
                onCancelCustomSnooze={() => setCustomSnoozeId(null)}
                onAccept={() => void handleAccept(task.id)}
                onOpenConversation={() => openConversation(task)}
              />
            ))}
          </div>

          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-ink-300">
              <ClipboardList className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma tarefa neste filtro</p>
              <p className="text-xs mt-1 text-ink-400">
                Use + Nova Tarefa ou crie uma nota interna com data na conversa
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Alias pedido pelo mockup (Mural.tsx). */
export { MuralView as Mural };
