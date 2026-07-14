import { useEffect, useMemo, useState } from 'react';
import { FileText, Film, Music, Send, X } from 'lucide-react';
import { detectMediaType } from './messageUtils';

interface MediaPreviewProps {
  file: File;
  onCancel: () => void;
  onSend: (file: File, caption: string) => void;
  sending?: boolean;
}

export function MediaPreview({ file, onCancel, onSend, sending }: MediaPreviewProps) {
  const [caption, setCaption] = useState('');
  const mediaType = detectMediaType(file.type || '');
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 animate-fade-in">
      <div className="card w-full max-w-lg p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Enviar arquivo</h3>
          <button type="button" onClick={onCancel} className="btn-ghost p-1" disabled={sending}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-lg bg-ink-800 border border-ink-700 overflow-hidden flex items-center justify-center min-h-[160px] max-h-[360px]">
          {mediaType === 'image' && (
            <img src={objectUrl} alt={file.name} className="max-h-[360px] max-w-full object-contain" />
          )}
          {mediaType === 'video' && (
            <video src={objectUrl} controls className="max-h-[360px] max-w-full" />
          )}
          {mediaType === 'audio' && (
            <div className="flex flex-col items-center gap-3 p-6 w-full">
              <Music className="w-10 h-10 text-brand-400" />
              <audio src={objectUrl} controls className="w-full" />
            </div>
          )}
          {mediaType === 'file' && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              {file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf') ? (
                <FileText className="w-12 h-12 text-danger-400" />
              ) : file.type.startsWith('video/') ? (
                <Film className="w-12 h-12 text-brand-400" />
              ) : (
                <FileText className="w-12 h-12 text-ink-200" />
              )}
              <p className="text-sm text-white break-all px-4">{file.name}</p>
              <p className="text-xs text-ink-300">{formatBytes(file.size)}</p>
            </div>
          )}
        </div>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Legenda (opcional)"
          rows={2}
          disabled={sending}
          className="input resize-none text-sm"
        />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost text-sm px-3 py-1.5" disabled={sending}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSend(file, caption.trim())}
            disabled={sending}
            className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
