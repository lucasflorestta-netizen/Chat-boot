/** Resolve API base URL for fetch calls (supports relative /api for LAN installer). */
export function resolveApiUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (typeof env === 'string' && env.length > 0) {
    if (env === 'same-origin') {
      return `${window.location.origin}/api`;
    }
    if (env.startsWith('/')) {
      return `${window.location.origin}${env.replace(/\/$/, '')}`;
    }
    return env.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && !import.meta.env.DEV) {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:3001/api';
}

/** Resolve WebSocket / media host origin. */
export function resolveWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (typeof env === 'string') {
    if (env === '' || env === 'same-origin') {
      return window.location.origin;
    }
    if (env.startsWith('/')) {
      return window.location.origin;
    }
    return env.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && !import.meta.env.DEV) {
    return window.location.origin;
  }
  return 'http://localhost:3001';
}
