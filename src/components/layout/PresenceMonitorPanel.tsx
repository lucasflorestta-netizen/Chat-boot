import { Activity, ChevronDown } from 'lucide-react';
import { useUserPresence } from '../../hooks/useUserPresence';

interface PresenceMonitorPanelProps {
  open: boolean;
  onToggle: () => void;
}

export function PresenceMonitorPanel({ open, onToggle }: PresenceMonitorPanelProps) {
  const { users, loading, error, savingIds, setOnline } = useUserPresence(open);

  return (
    <div
      className={`flex flex-col border-t border-ink-700 ${
        open ? 'flex-1 min-h-0' : 'shrink-0'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors shrink-0 ${
          open
            ? 'bg-ink-800 text-white'
            : 'text-ink-200 hover:bg-ink-700 hover:text-white'
        }`}
        aria-expanded={open}
      >
        <Activity className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">Monitoramento</span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 opacity-70 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
          {loading && (
            <p className="px-2 py-2 text-xs text-ink-400">Carregando…</p>
          )}
          {!loading && error && (
            <p className="px-2 py-2 text-xs text-danger-400">{error}</p>
          )}
          {!loading && !error && users.length === 0 && (
            <p className="px-2 py-2 text-xs text-ink-400">Nenhum usuário</p>
          )}
          {!loading &&
            !error &&
            users.map((user) => {
              const saving = savingIds.has(user.id);
              const label = user.name?.trim() || user.username;
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-ink-800/80"
                >
                  <span className="flex-1 min-w-0 text-xs text-ink-100 truncate" title={label}>
                    {label}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={user.online}
                    aria-label={`${label}: ${user.online ? 'online' : 'offline'}`}
                    disabled={saving}
                    onClick={() => void setOnline(user.id, !user.online)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      user.online ? 'bg-success-500' : 'bg-ink-600'
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        user.online ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
