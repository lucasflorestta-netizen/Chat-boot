import { Check } from 'lucide-react';
import { CHAT_WALLPAPERS } from '../../lib/chatWallpapers';

interface WallpaperPickerProps {
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function WallpaperPicker({ selectedId, onSelect, onClose }: WallpaperPickerProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute z-50 top-14 right-4 w-72 card p-3 shadow-2xl animate-fade-in">
        <p className="text-xs font-semibold text-white mb-2">Tema de fundo</p>
        <div className="grid grid-cols-4 gap-2">
          {CHAT_WALLPAPERS.map((w) => {
            const active = w.id === selectedId;
            return (
              <button
                key={w.id}
                type="button"
                title={w.label}
                onClick={() => {
                  onSelect(w.id);
                  onClose();
                }}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  active ? 'border-brand-400 ring-2 ring-brand-500/40' : 'border-ink-600 hover:border-ink-400'
                }`}
                style={w.previewStyle}
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Check className="w-4 h-4 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-ink-300 mt-2 truncate">
          {CHAT_WALLPAPERS.find((w) => w.id === selectedId)?.label ?? 'Escuro'}
        </p>
      </div>
    </>
  );
}
