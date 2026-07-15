import type { CSSProperties } from 'react';

export interface ChatWallpaper {
  id: string;
  label: string;
  /** CSS class applied to the chat message area */
  className: string;
  /** Inline style for the picker thumbnail preview */
  previewStyle: CSSProperties;
}

export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  {
    id: 'default',
    label: 'Escuro',
    className: 'chat-bg chat-bg--default',
    previewStyle: {
      backgroundColor: '#0a0e1a',
      backgroundImage:
        'radial-gradient(circle at 20% 30%, rgba(37, 99, 235, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(37, 99, 235, 0.08) 0%, transparent 50%)',
    },
  },
  {
    id: 'slate',
    label: 'Ardósia',
    className: 'chat-bg chat-bg--slate',
    previewStyle: {
      backgroundColor: '#0f172a',
      backgroundImage:
        'radial-gradient(circle at 30% 20%, rgba(148, 163, 184, 0.08) 0%, transparent 45%), radial-gradient(circle at 70% 80%, rgba(71, 85, 105, 0.12) 0%, transparent 50%)',
    },
  },
  {
    id: 'forest',
    label: 'Floresta',
    className: 'chat-bg chat-bg--forest',
    previewStyle: {
      backgroundColor: '#0a1410',
      backgroundImage:
        'radial-gradient(circle at 25% 40%, rgba(34, 197, 94, 0.08) 0%, transparent 50%), radial-gradient(circle at 75% 60%, rgba(22, 101, 52, 0.1) 0%, transparent 45%)',
    },
  },
  {
    id: 'sand',
    label: 'Areia',
    className: 'chat-bg chat-bg--sand',
    previewStyle: {
      backgroundColor: '#1a1610',
      backgroundImage:
        'radial-gradient(circle at 20% 30%, rgba(217, 169, 90, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(180, 130, 60, 0.08) 0%, transparent 50%)',
    },
  },
  {
    id: 'rose',
    label: 'Rosa',
    className: 'chat-bg chat-bg--rose',
    previewStyle: {
      backgroundColor: '#160e12',
      backgroundImage:
        'radial-gradient(circle at 30% 25%, rgba(244, 114, 182, 0.08) 0%, transparent 50%), radial-gradient(circle at 70% 75%, rgba(190, 24, 93, 0.07) 0%, transparent 45%)',
    },
  },
  {
    id: 'ocean',
    label: 'Oceano',
    className: 'chat-bg chat-bg--ocean',
    previewStyle: {
      backgroundColor: '#0a1218',
      backgroundImage:
        'radial-gradient(circle at 25% 35%, rgba(56, 189, 248, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 65%, rgba(14, 116, 144, 0.1) 0%, transparent 45%)',
    },
  },
  {
    id: 'dither',
    label: 'Padrão',
    className: 'chat-bg chat-bg--dither',
    previewStyle: {
      backgroundColor: '#0c1018',
      backgroundImage:
        'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'2\' cy=\'2\' r=\'1\' fill=\'%23ffffff\' fill-opacity=\'0.04\'/%3E%3C/svg%3E")',
    },
  },
  {
    id: 'midnight',
    label: 'Meia-noite',
    className: 'chat-bg chat-bg--midnight',
    previewStyle: {
      backgroundColor: '#05070e',
      backgroundImage:
        'linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, transparent 50%), linear-gradient(225deg, rgba(99, 102, 241, 0.05) 0%, transparent 50%)',
    },
  },
];

const STORAGE_PREFIX = 'chat-wallpaper:';

export function getWallpaperId(profileId: string | undefined | null): string {
  if (!profileId) return 'default';
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${profileId}`) || 'default';
  } catch {
    return 'default';
  }
}

export function setWallpaperId(profileId: string, wallpaperId: string) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${profileId}`, wallpaperId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveWallpaper(id: string): ChatWallpaper {
  return CHAT_WALLPAPERS.find((w) => w.id === id) ?? CHAT_WALLPAPERS[0];
}
