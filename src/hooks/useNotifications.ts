import { useEffect, useRef, useState } from 'react';

type NotificationType = 'message' | 'ticket';

interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
}

let counter = 0;

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  const notify = (type: NotificationType, title: string, body: string) => {
    const id = `notif-${++counter}`;
    setNotifications((prev) => [...prev, { id, type, title, body }]);
    playSound(type);
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return { notifications, notify, soundEnabled, setSoundEnabled };
}
