import type { Message, MessageType } from '../../types';

export function mediaLabel(mediaType: MessageType | string): string {
  switch (mediaType) {
    case 'image':
      return 'Foto';
    case 'audio':
      return 'Áudio';
    case 'video':
      return 'Vídeo';
    case 'sticker':
      return 'Figurinha';
    case 'file':
      return 'Documento';
    case 'note':
      return 'Nota';
    default:
      return 'Mensagem';
  }
}

export function replyAuthorLabel(message: Message, contactName?: string | null): string {
  if (message.sender_type === 'client') return contactName || 'Cliente';
  if (message.sender_type === 'bot' || message.sender_type === 'system') return 'Sistema';
  return message.sender?.name || 'Agente';
}

export function replySnippet(message: Message): string {
  if (
    message.deleted_by_client ||
    message.is_deleted ||
    message.deleted_for_client
  ) {
    return 'Mensagem apagada';
  }
  if (message.body?.trim()) {
    const text = message.body.trim();
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  return mediaLabel(message.media_type);
}

export function detectMediaType(
  mime: string,
  fileName?: string | null,
): 'image' | 'audio' | 'file' | 'video' {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';

  // Windows/Explorer às vezes entrega File sem MIME — usa a extensão.
  const name = (fileName || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  if (
    ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif'].includes(
      ext,
    )
  ) {
    return 'image';
  }
  if (['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus', '.webm'].includes(ext)) {
    // .webm pode ser vídeo; sem MIME preferimos áudio só para nomes típicos de voice note
    if (ext === '.webm' && !/audio|voice|ptt|grava/i.test(name)) return 'video';
    return 'audio';
  }
  if (['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.webm'].includes(ext)) {
    return 'video';
  }
  return 'file';
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
