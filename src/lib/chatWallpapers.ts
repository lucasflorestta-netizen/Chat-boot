import type { CSSProperties } from 'react';
import { mediaUrl } from './api';

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
    id: 'linen',
    label: 'Linho',
    className: 'chat-bg chat-bg--linen',
    previewStyle: {
      backgroundColor: '#f7f4ef',
      backgroundImage:
        'radial-gradient(circle at 20% 30%, rgba(180, 160, 130, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(200, 185, 160, 0.1) 0%, transparent 50%)',
    },
  },
  {
    id: 'mist',
    label: 'Névoa',
    className: 'chat-bg chat-bg--mist',
    previewStyle: {
      backgroundColor: '#f3f4f6',
      backgroundImage:
        'radial-gradient(circle at 30% 20%, rgba(148, 163, 184, 0.14) 0%, transparent 45%), radial-gradient(circle at 70% 80%, rgba(100, 116, 139, 0.08) 0%, transparent 50%)',
    },
  },
  {
    id: 'sage',
    label: 'Sálvia',
    className: 'chat-bg chat-bg--sage',
    previewStyle: {
      backgroundColor: '#f2f7f4',
      backgroundImage:
        'radial-gradient(circle at 25% 40%, rgba(134, 179, 149, 0.14) 0%, transparent 50%), radial-gradient(circle at 75% 60%, rgba(110, 160, 130, 0.1) 0%, transparent 45%)',
    },
  },
  {
    id: 'sand',
    label: 'Areia',
    className: 'chat-bg chat-bg--sand',
    previewStyle: {
      backgroundColor: '#f8f3ea',
      backgroundImage:
        'radial-gradient(circle at 20% 30%, rgba(217, 180, 120, 0.16) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(200, 160, 100, 0.1) 0%, transparent 50%)',
    },
  },
  {
    id: 'sky',
    label: 'Céu',
    className: 'chat-bg chat-bg--sky',
    previewStyle: {
      backgroundColor: '#f0f6fb',
      backgroundImage:
        'radial-gradient(circle at 25% 35%, rgba(125, 180, 220, 0.16) 0%, transparent 50%), radial-gradient(circle at 75% 65%, rgba(100, 160, 200, 0.1) 0%, transparent 45%)',
    },
  },
];

export const CUSTOM_WALLPAPER_ID = 'custom';

export function resolveWallpaper(
  id: string,
  customImageUrl?: string | null,
): { className: string; style?: CSSProperties; label: string } {
  if (id === CUSTOM_WALLPAPER_ID && customImageUrl) {
    const url = mediaUrl(customImageUrl) ?? customImageUrl;
    return {
      className: 'chat-bg chat-bg--custom',
      style: {
        backgroundImage: `url("${url}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      },
      label: 'Personalizado',
    };
  }
  const preset = CHAT_WALLPAPERS.find((w) => w.id === id) ?? CHAT_WALLPAPERS[0];
  return {
    className: preset.className,
    label: preset.label,
  };
}
