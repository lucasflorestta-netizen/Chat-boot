import { api, uploadFile, mediaUrl } from './api';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export type AvatarUploadResult = {
  relativeUrl: string;
  displayUrl: string;
};

/**
 * Uploads an avatar image.
 * When `persist` is true (default), also PATCHes the user immediately.
 * When false, only uploads the file — caller must save `relativeUrl` later.
 */
export async function uploadAgentAvatar(
  profileId: string,
  file: File,
  options?: { persist?: boolean },
): Promise<AvatarUploadResult> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Use uma imagem JPG, PNG, WebP ou GIF');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Imagem muito grande (máximo 5 MB)');
  }

  const relativeUrl = await uploadFile(file);
  const busted = `${relativeUrl}${relativeUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  const displayUrl = mediaUrl(busted) || busted;

  if (options?.persist !== false) {
    await api(`/users/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl: relativeUrl }),
    });
  }

  return { relativeUrl, displayUrl };
}
