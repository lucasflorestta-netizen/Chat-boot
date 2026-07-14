import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, fileName: string) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

type Phase = 'idle' | 'recording' | 'preview';

/** In-composer voice note recorder using MediaRecorder. */
export function VoiceRecorder({ onRecorded, disabled, onBusyChange }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState('audio/webm');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onBusyChange?.(phase !== 'idle');
  }, [phase, onBusyChange]);

  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferred =
        (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') && 'audio/ogg;codecs=opus') ||
        (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') && 'audio/webm;codecs=opus') ||
        (MediaRecorder.isTypeSupported('audio/webm') && 'audio/webm') ||
        (MediaRecorder.isTypeSupported('audio/mp4') && 'audio/mp4') ||
        '';

      const recorder = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);

      setMimeType(recorder.mimeType || preferred || 'audio/webm');
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopTracks();
        clearTimer();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || preferred || 'audio/webm' });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl(url);
        setPhase('preview');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setElapsed(0);
      setPhase('recording');
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Permissão do microfone negada. Libere o acesso nas configurações do navegador.');
      } else if (name === 'NotFoundError') {
        setError('Nenhum microfone encontrado.');
      } else {
        setError('Não foi possível iniciar a gravação de áudio.');
      }
      stopTracks();
      setPhase('idle');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const cancelAll = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    stopTracks();
    clearTimer();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setElapsed(0);
    setPhase('idle');
    setError(null);
  };

  const sendRecording = () => {
    if (!previewBlob) return;
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    onRecorded(previewBlob, `audio-${Date.now()}.${ext}`);
    cancelAll();
  };

  if (phase === 'recording') {
    return (
      <div className="flex items-center gap-2 flex-1 bg-ink-800 rounded-lg px-3 py-2 border border-danger-500/40">
        <span className="w-2 h-2 rounded-full bg-danger-500 animate-pulse" />
        <span className="text-sm text-white tabular-nums">{formatTime(elapsed)}</span>
        <span className="text-xs text-ink-300 flex-1">Gravando…</span>
        <button type="button" onClick={cancelAll} className="btn-ghost p-1.5 text-ink-300" title="Cancelar">
          <Trash2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={stopRecording} className="btn-primary p-2 rounded-lg" title="Parar">
          <Square className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (phase === 'preview' && previewUrl) {
    return (
      <div className="flex items-center gap-2 flex-1 bg-ink-800 rounded-lg px-3 py-2 border border-ink-600">
        <audio src={previewUrl} controls className="flex-1 min-w-0 h-8" />
        <button type="button" onClick={cancelAll} className="btn-ghost p-1.5" title="Descartar">
          <Trash2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={sendRecording} className="btn-primary p-2 rounded-lg" title="Enviar áudio">
          <Send className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      {error && <p className="text-[10px] text-danger-400 mb-1 max-w-[200px] text-right">{error}</p>}
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        className="btn-ghost p-2.5 rounded-lg"
        title="Gravar áudio"
      >
        {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
      </button>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
