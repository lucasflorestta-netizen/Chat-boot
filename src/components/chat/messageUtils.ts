import type { Message, MessageType } from '../../types';

/** Shared select used for initial load and realtime enrichment. */
export const MESSAGE_SELECT =
  '*, sender:profiles!messages_sender_id_fkey(*), reply_to:messages!reply_to_message_id(*)';

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
  if (message.is_deleted) return 'Mensagem apagada';
  if (message.body?.trim()) {
    const text = message.body.trim();
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  return mediaLabel(message.media_type);
}

export function detectMediaType(mime: string): 'image' | 'audio' | 'file' | 'video' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
