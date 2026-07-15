import { api, uploadFile, mediaUrl } from './api';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadAgentAvatar(profileId: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Use uma imagem JPG, PNG, WebP ou GIF');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Imagem muito grande (máximo 5 MB)');
  }

  const relativeUrl = await uploadFile(file);
  const busted = `${relativeUrl}${relativeUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

  await api(`/users/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ avatarUrl: relativeUrl }),
  });

  return mediaUrl(busted) || busted;
}
