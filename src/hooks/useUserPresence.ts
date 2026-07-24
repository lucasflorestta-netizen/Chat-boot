import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';

export interface PresenceUser {
  id: string;
  name: string | null;
  username: string;
  status?: string;
  online: boolean;
  lastDisconnectedAt?: string | null;
}

interface PresenceResponse {
  users: PresenceUser[];
}

interface PresenceEvent {
  userId: string;
  online: boolean;
  lastDisconnectedAt: string | null;
}

function applyPresenceEvent(
  prev: PresenceUser[],
  p: PresenceEvent,
): PresenceUser[] {
  const idx = prev.findIndex((u) => u.id === p.userId);
  if (idx < 0) return prev;
  const current = prev[idx];
  if (
    current.online === p.online &&
    current.lastDisconnectedAt === p.lastDisconnectedAt
  ) {
    return prev;
  }
  const next = [...prev];
  next[idx] = {
    ...current,
    online: p.online,
    lastDisconnectedAt: p.lastDisconnectedAt,
    ...(p.online === false ? { status: current.status } : {}),
  };
  return next;
}

export function useUserPresence(enabled: boolean) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchPresence = useCallback(async () => {
    const data = await api<PresenceResponse>('/dashboard/presence');
    setUsers(data.users ?? []);
    setError(null);
    return data;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        await fetchPresence();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar presença');
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const socket = getSocket() ?? connectSocket();

    const onPresence = (p: PresenceEvent) => {
      if (!p?.userId) return;
      setUsers((prev) => applyPresenceEvent(prev, p));
    };

    const onUserUpdated = (payload: { user?: { id?: string; status?: string } }) => {
      const raw = payload?.user;
      if (!raw?.id) return;
      const status = String(raw.status ?? '').toUpperCase();
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== raw.id) return u;
          // Pausa e Offline = off no monitoramento.
          if (status === 'OFFLINE' || status === 'PAUSA') {
            return { ...u, status, online: false };
          }
          return { ...u, status: status || u.status };
        }),
      );
      // Voltou a Disponível: recalcula presença real (WS) na API.
      if (status === 'DISPONIVEL') {
        void fetchPresence().catch(() => {
          /* ignore */
        });
      }
    };

    const onReconnect = () => {
      void fetchPresence().catch(() => {
        /* ignore — lista já existe */
      });
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      connectSocket();
      void fetchPresence().catch(() => {
        /* ignore */
      });
    };

    socket.on('users.presence', onPresence);
    socket.on('user.updated', onUserUpdated);
    socket.on('connect', onReconnect);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      socket.off('users.presence', onPresence);
      socket.off('user.updated', onUserUpdated);
      socket.off('connect', onReconnect);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, fetchPresence]);

  const setOnline = useCallback(async (userId: string, online: boolean) => {
    setSavingIds((prev) => new Set(prev).add(userId));
    try {
      const updated = await api<{ id: string; online: boolean; status?: string }>(
        `/users/${userId}/online`,
        {
          method: 'PATCH',
          body: JSON.stringify({ online }),
        },
      );
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                online: Boolean(updated.online),
                status: updated.status ?? u.status,
              }
            : u,
        ),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao atualizar presença');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }, []);

  return { users, loading, error, savingIds, setOnline };
}
