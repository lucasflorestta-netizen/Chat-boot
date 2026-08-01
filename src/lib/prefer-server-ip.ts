import { resolveApiUrl } from './runtime-urls';

/**
 * Se o usuário abriu por 127.0.0.1/localhost, redireciona para o IP da rede
 * gravado no FRONTEND_URL do servidor (atalhos / instalação).
 */
export async function preferInstalledServerIp(): Promise<void> {
  // Em Vite/dev (localhost:5173) não redirecionar para o IP do cliente instalado.
  if (import.meta.env.DEV) return;
  if (typeof window === 'undefined') return;
  const host = window.location.hostname;
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLoopback) return;

  try {
    const base = resolveApiUrl();
    const res = await fetch(`${base}/server-info`, { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as { frontendUrl?: string | null };
    const target = (data.frontendUrl || '').replace(/\/$/, '');
    if (!target) return;

    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return;
    }

    // Só redireciona se for outro host (IP da LAN) na mesma porta aproximada
    if (
      url.hostname === host ||
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost'
    ) {
      return;
    }

    const dest = `${url.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (dest !== window.location.href) {
      window.location.replace(dest);
    }
  } catch {
    /* silencioso — server-info pode estar offline */
  }
}
