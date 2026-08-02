import { resolveApiUrl, resolveWsUrl } from './runtime-urls';

const TOKEN_KEY = 'cc_access_token';
const LEGACY_TOKEN_KEY = 'nge_access_token';

function clearPersistedTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Session-only auth: survives refresh, cleared when the browser closes. */
export function getToken() {
  try {
    const session = sessionStorage.getItem(TOKEN_KEY);
    if (session) return session;
  } catch {
    /* ignore */
  }
  // Drop leftovers from older builds that used localStorage.
  clearPersistedTokens();
  return null;
}

export function setToken(t: string | null) {
  clearPersistedTokens();
  try {
    if (t) {
      sessionStorage.setItem(TOKEN_KEY, t);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Disparado quando a API rejeita o token (sessão única / expirada). */
export const SESSION_EXPIRED_EVENT = 'cc:session-expired';

export function notifySessionExpired(message?: string) {
  setToken(null);
  try {
    window.dispatchEvent(
      new CustomEvent(SESSION_EXPIRED_EVENT, {
        detail: {
          message:
            message ||
            'Sessão encerrada — este usuário entrou em outro navegador ou aba',
        },
      }),
    );
  } catch {
    /* ignore (SSR / testes) */
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const API_URL = resolveApiUrl();
  const res = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let msg: unknown = res.statusText;
    const raw = await res.text().catch(() => '');
    if (raw) {
      try {
        const j = JSON.parse(raw) as { message?: string | string[] };
        msg = Array.isArray(j.message) ? j.message.join(' ') : j.message || raw;
      } catch {
        msg = raw.trim() || msg;
      }
    }
    const text = typeof msg === 'string' ? msg : 'Request failed';
    // Só limpa sessão se havia token (evita logout no login com senha errada).
    if (res.status === 401 && token) {
      notifySessionExpired(text);
    }
    throw new Error(text);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Mesmo contrato de `api`, mas retorna Blob (PDF, arquivos, etc.). */
export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const API_URL = resolveApiUrl();
  const res = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let msg: unknown = res.statusText;
    const raw = await res.text().catch(() => '');
    if (raw) {
      try {
        const j = JSON.parse(raw) as { message?: string | string[] };
        msg = Array.isArray(j.message) ? j.message.join(' ') : j.message || raw;
      } catch {
        msg = raw.trim() || msg;
      }
    }
    const text = typeof msg === 'string' ? msg : 'Request failed';
    if (res.status === 401 && token) {
      notifySessionExpired(text);
    }
    throw new Error(text);
  }
  return res.blob();
}

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  // Static /uploads is served at host root (same origin as the panel in the installer).
  const base = resolveWsUrl().replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function uploadFile(file: File): Promise<string> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const apiBase = resolveApiUrl().replace(/\/$/, '');
  const originBase = resolveWsUrl().replace(/\/$/, '');

  // Ordem: /api/uploads (cloud + API nova) e /uploads (instalador local legado).
  const candidates = [`${apiBase}/uploads`, `${originBase}/uploads`];
  const tried = new Set<string>();
  let lastMsg = 'Falha no upload';

  for (const url of candidates) {
    if (tried.has(url)) continue;
    tried.add(url);
    const form = new FormData();
    form.append('file', file);
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body: form });
    } catch (err) {
      lastMsg = err instanceof Error ? err.message : 'Falha de rede no upload';
      continue;
    }
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (data?.url) return data.url;
      throw new Error('Upload nao retornou URL do arquivo');
    }
    let msg: string = res.statusText || `HTTP ${res.status}`;
    const raw = await res.text().catch(() => '');
    if (raw) {
      try {
        const j = JSON.parse(raw) as { message?: string | string[] };
        msg = Array.isArray(j.message) ? j.message.join(' ') : j.message || raw;
      } catch {
        msg = raw.trim() || msg;
      }
    }
    lastMsg = typeof msg === 'string' ? msg : 'Falha no upload';
    if (res.status === 401 && token) {
      notifySessionExpired(lastMsg);
      throw new Error(lastMsg);
    }
    // 404 = rota ausente → tenta o outro caminho. 401 = token; não adianta fallback.
    if (res.status !== 404 && res.status !== 405) break;
  }

  throw new Error(lastMsg);
}
