import { getToken, notifySessionExpired } from './api';
import { resolveApiUrl, resolveWsUrl } from './runtime-urls';

/** Só comprime imagens acima deste tamanho (comunicador interno). */
const IMAGE_COMPRESS_THRESHOLD = 400 * 1024;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem'));
    };
    img.src = url;
  });
}

/**
 * Reduz dimensões/qualidade de fotos grandes no browser.
 * GIF/SVG e arquivos pequenos ficam intactos. Em falha, devolve o original.
 */
export async function compressInternalChatImage(file: File): Promise<File> {
  const mime = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (mime === 'image/gif' || name.endsWith('.gif')) return file;
  if (mime === 'image/svg+xml' || name.endsWith('.svg')) return file;
  if (file.size <= IMAGE_COMPRESS_THRESHOLD) return file;

  try {
    const img = await loadImageElement(file);
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) return file;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'imagem';
    return new File([blob], `${base}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function parseUploadError(status: number, raw: string, statusText: string): string {
  let msg = statusText || `HTTP ${status}`;
  if (raw) {
    try {
      const j = JSON.parse(raw) as { message?: string | string[] };
      msg = Array.isArray(j.message) ? j.message.join(' ') : j.message || raw;
    } catch {
      msg = raw.trim() || msg;
    }
  }
  return typeof msg === 'string' ? msg : 'Falha no upload';
}

function xhrPostFile(
  url: string,
  file: File,
  token: string | null,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        body: xhr.responseText || '',
      });
    };
    xhr.onerror = () => reject(new Error('Falha de rede no upload'));
    xhr.onabort = () => reject(new Error('Upload cancelado'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/**
 * Upload do comunicador interno com progresso (XHR).
 * Usa os mesmos endpoints de `uploadFile`; não altera o helper compartilhado.
 */
export async function uploadInternalChatFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const token = getToken();
  const apiBase = resolveApiUrl().replace(/\/$/, '');
  const originBase = resolveWsUrl().replace(/\/$/, '');
  const candidates = [`${apiBase}/uploads`, `${originBase}/uploads`];
  const tried = new Set<string>();
  let lastMsg = 'Falha no upload';

  for (const url of candidates) {
    if (tried.has(url)) continue;
    tried.add(url);
    onProgress?.(0);
    let result: { ok: boolean; status: number; body: string };
    try {
      result = await xhrPostFile(url, file, token, onProgress);
    } catch (err) {
      lastMsg = err instanceof Error ? err.message : 'Falha de rede no upload';
      continue;
    }

    if (result.ok) {
      onProgress?.(100);
      try {
        const data = JSON.parse(result.body) as { url?: string };
        if (data?.url) return data.url;
      } catch {
        /* fall through */
      }
      throw new Error('Upload nao retornou URL do arquivo');
    }

    lastMsg = parseUploadError(result.status, result.body, `HTTP ${result.status}`);
    if (result.status === 401 && token) {
      notifySessionExpired(lastMsg);
      throw new Error(lastMsg);
    }
    if (result.status !== 404 && result.status !== 405) break;
  }

  throw new Error(lastMsg);
}
