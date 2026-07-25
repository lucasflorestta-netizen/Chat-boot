const STORAGE_KEY = 'cc_recent_stickers';
const LEGACY_STORAGE_KEY = 'nge_recent_stickers';
const MAX_RECENTS = 24;

function readStorageRaw(): string | null {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return current;
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    localStorage.setItem(STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacy;
  }
  return null;
}

export interface RecentSticker {
  url: string;
  at: number;
}

function normalizeKey(url: string): string {
  const relative = toUploadPath(url);
  return relative ?? url.split('?')[0];
}

/** Convert absolute or relative media URL to `/uploads/...` when possible. */
export function toUploadPath(url: string): string | null {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return null;
  const clean = url.split('?')[0];
  if (clean.startsWith('/uploads/')) return clean;
  try {
    const u = new URL(clean);
    if (u.pathname.startsWith('/uploads/')) return u.pathname;
  } catch {
    /* ignore */
  }
  const idx = clean.indexOf('/uploads/');
  if (idx >= 0) return clean.slice(idx);
  return null;
}

export function loadRecentStickers(): RecentSticker[] {
  try {
    const raw = readStorageRaw();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentSticker =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as RecentSticker).url === 'string' &&
          typeof (item as RecentSticker).at === 'number',
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function pushRecentSticker(url: string): RecentSticker[] {
  const path = toUploadPath(url) ?? url.split('?')[0];
  if (!path || path.startsWith('blob:') || path.startsWith('data:')) {
    return loadRecentStickers();
  }
  const key = normalizeKey(path);
  const existing = loadRecentStickers().filter((s) => normalizeKey(s.url) !== key);
  const next = [{ url: path, at: Date.now() }, ...existing].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
  return next;
}

/** Merge localStorage recents with sticker URLs from open ticket messages. */
export function mergeRecentStickers(
  fromStorage: RecentSticker[],
  messageUrls: string[],
): RecentSticker[] {
  const map = new Map<string, RecentSticker>();

  for (const s of fromStorage) {
    const key = normalizeKey(s.url);
    if (!key) continue;
    map.set(key, { url: toUploadPath(s.url) ?? s.url, at: s.at });
  }

  let fakeAt = Date.now() - messageUrls.length;
  for (const url of messageUrls) {
    const path = toUploadPath(url);
    if (!path) continue;
    const key = normalizeKey(path);
    if (!map.has(key)) {
      map.set(key, { url: path, at: fakeAt++ });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_RECENTS);
}
