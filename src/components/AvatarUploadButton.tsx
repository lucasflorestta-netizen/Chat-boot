import { useEffect, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { ContactAvatar } from './ContactAvatar';
import { uploadAgentAvatar, type AvatarUploadResult } from '../lib/uploadAvatar';

interface AvatarUploadButtonProps {
  profileId: string;
  name?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  rounded?: 'full' | 'lg' | '2xl';
  className?: string;
  /** When false, only uploads the file; parent must persist on save. Default true. */
  persist?: boolean;
  onUploaded: (result: AvatarUploadResult) => void;
}

export function AvatarUploadButton({
  profileId,
  name,
  avatarUrl,
  size = 'md',
  rounded = 'full',
  className = '',
  persist = true,
  onUploaded,
}: AvatarUploadButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(avatarUrl);

  useEffect(() => {
    setPreviewUrl(avatarUrl);
  }, [avatarUrl]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadAgentAvatar(profileId, file, { persist });
      setPreviewUrl(result.displayUrl);
      onUploaded(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar foto');
    } finally {
      setUploading(false);
    }
  };

  const roundedClass =
    rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : 'rounded-2xl';

  return (
    <div className={`relative inline-block ${className}`}>
      <label className="group relative cursor-pointer block" title="Alterar foto">
        <ContactAvatar name={name} profilePicUrl={previewUrl} size={size} rounded={rounded} />
        <span
          className={`absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity ${roundedClass}`}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : (
            <Camera className="w-4 h-4 text-white" />
          )}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={uploading}
          onChange={(e) => void handleChange(e)}
        />
      </label>
      {error && (
        <p className="absolute left-0 top-full mt-1 text-[10px] text-danger-400 whitespace-nowrap z-10">
          {error}
        </p>
      )}
    </div>
  );
}
