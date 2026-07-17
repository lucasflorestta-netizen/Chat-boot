import { useCallback, useEffect, useRef, useState } from 'react';

export type NotificationType = 'message' | 'ticket';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  avatarUrl?: string | null;
  ticketId?: string | null;
  label?: string;
}

export interface NotifyOptions {
  avatarUrl?: string | null;
  ticketId?: string | null;
  label?: string;
}

let counter = 0;

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const playSound = (type: NotificationType) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = type === 'message' ? 800 : 600;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // AudioContext not available
    }
  };

  const notify = useCallback(
    (type: NotificationType, title: string, body: string, options?: NotifyOptions) => {
      const id = `notif-${++counter}`;
      setNotifications((prev) => [
        ...prev,
        {
          id,
          type,
          title,
          body,
          avatarUrl: options?.avatarUrl ?? null,
          ticketId: options?.ticketId ?? null,
          label: options?.label,
        },
      ]);
      playSound(type);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 5000);
    },
    // playSound depends on soundEnabled via closure; keep notify stable enough for effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [soundEnabled],
  );

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return { notifications, notify, dismiss, soundEnabled, setSoundEnabled };
}
