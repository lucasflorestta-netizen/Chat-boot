import { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { CHAT_WALLPAPERS, CUSTOM_WALLPAPER_ID } from '../../lib/chatWallpapers';
import { mediaUrl, uploadFile } from '../../lib/api';

interface WallpaperPickerProps {
  selectedId: string;
  customImageUrl?: string | null;
  saving?: boolean;
  onSelect: (id: string) => void;
  onCustomUploaded: (url: string) => void;
  onClose: () => void;
}

export function WallpaperPicker({
  selectedId,
  customImageUrl,
  saving = false,
  onSelect,
  onCustomUploaded,
  onClose,
}: WallpaperPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = saving || uploading;
  const customActive = selectedId === CUSTOM_WALLPAPER_ID && !!customImageUrl;
  const selectedLabel =
    selectedId === CUSTOM_WALLPAPER_ID
      ? 'Personalizado'
      : (CHAT_WALLPAPERS.find((w) => w.id === selectedId)?.label ?? 'Linho');

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      setError('Envie uma imagem (PNG, JPG, WebP…).');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onCustomUploaded(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute z-50 top-14 right-4 w-72 card p-3 shadow-2xl animate-fade-in">
        <p className="text-xs font-semibold text-white mb-2">Papel de parede</p>
        <div className="grid grid-cols-3 gap-2">
          {CHAT_WALLPAPERS.map((w) => {
            const active = w.id === selectedId && selectedId !== CUSTOM_WALLPAPER_ID;
            return (
              <button
                key={w.id}
                type="button"
                title={w.label}
                disabled={busy}
                onClick={() => {
                  onSelect(w.id);
                  onClose();
                }}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all disabled:opacity-50 ${
                  active ? 'border-brand-400 ring-2 ring-brand-500/40' : 'border-ink-600 hover:border-ink-400'
                }`}
                style={w.previewStyle}
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Check className="w-4 h-4 text-ink-800" />
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            title="Imagem personalizada"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-1 ${
              customActive ? 'border-brand-400 ring-2 ring-brand-500/40' : 'border-ink-600 hover:border-ink-400'
            }`}
            style={
              customImageUrl
                ? {
                    backgroundImage: `url("${mediaUrl(customImageUrl) ?? customImageUrl}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : { backgroundColor: '#1e293b' }
            }
          >
            {busy ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <>
                <ImagePlus className="w-5 h-5 text-white drop-shadow" />
                <span className="text-[9px] text-white font-medium drop-shadow">Upload</span>
              </>
            )}
            {customActive && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="w-4 h-4 text-white" />
              </span>
            )}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {error && <p className="text-[10px] text-danger-400 mt-2">{error}</p>}
        <p className="text-[10px] text-ink-300 mt-2 truncate">{selectedLabel}</p>
      </div>
    </>
  );
}
