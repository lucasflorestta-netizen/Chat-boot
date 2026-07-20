import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Minus, StickyNote, X } from 'lucide-react';
import { api } from '../../lib/api';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface NotepadWindowProps {
  open: boolean;
  minimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
}

export function NotepadWindow({
  open,
  minimized,
  onClose,
  onMinimize,
  onRestore,
}: NotepadWindowProps) {
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ x: 120, y: 80 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const contentRef = useRef(content);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  contentRef.current = content;

  const persist = useCallback(async (value: string) => {
    setSaveState('saving');
    try {
      await api('/notepad', {
        method: 'PUT',
        body: JSON.stringify({ content: value }),
      });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  const scheduleSave = useCallback(
    (value: string) => {
      setSaveState('dirty');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void persist(value);
      }, 800);
    },
    [persist],
  );

  useEffect(() => {
    if (!open) {
      loadedRef.current = false;
      return;
    }
    if (loadedRef.current) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await api<{ content: string }>('/notepad');
        if (cancelled) return;
        setContent(data.content ?? '');
        setSaveState('idle');
        loadedRef.current = true;
      } catch {
        if (!cancelled) setSaveState('error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (open && !minimized) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (saveState === 'dirty') {
        void persist(contentRef.current);
      }
    }
  }, [open, minimized, saveState, persist]);

  const onPointerDownTitle = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMoveTitle = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(8, dragRef.current.originX + dx),
      y: Math.max(8, dragRef.current.originY + dy),
    });
  };

  const onPointerUpTitle = () => {
    dragRef.current = null;
  };

  const statusLabel =
    saveState === 'saving'
      ? 'Salvando…'
      : saveState === 'saved'
        ? 'Salvo'
        : saveState === 'dirty'
          ? 'Não salvo'
          : saveState === 'error'
            ? 'Erro ao salvar'
            : '';

  if (!open) return null;

  if (minimized) {
    return createPortal(
      <button
        type="button"
        onClick={onRestore}
        className="fixed bottom-4 left-4 z-[70] flex items-center gap-2 rounded-lg border border-white/10 bg-[#2c2c2c]/95 px-3 py-2 text-sm text-white shadow-xl backdrop-blur-md hover:bg-[#383838] animate-fade-in"
        title="Restaurar Bloco de Notas"
      >
        <StickyNote className="w-4 h-4 text-amber-300" />
        <span>Bloco de Notas</span>
        {saveState === 'dirty' || saveState === 'saving' ? (
          <span className="text-[10px] text-ink-300">•</span>
        ) : null}
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl animate-fade-in"
      style={{
        left: pos.x,
        top: pos.y,
        width: 'min(520px, calc(100vw - 24px))',
        height: 'min(420px, calc(100vh - 48px))',
        background: 'rgba(32, 32, 32, 0.92)',
        backdropFilter: 'blur(24px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
      }}
      role="dialog"
      aria-label="Bloco de Notas"
    >
      <div
        className="flex items-center gap-2 px-3 h-10 select-none cursor-grab active:cursor-grabbing border-b border-white/8"
        onPointerDown={onPointerDownTitle}
        onPointerMove={onPointerMoveTitle}
        onPointerUp={onPointerUpTitle}
        onPointerCancel={onPointerUpTitle}
      >
        <StickyNote className="w-4 h-4 text-amber-300 flex-shrink-0 pointer-events-none" />
        <span className="text-[13px] font-medium text-white/90 flex-1 truncate pointer-events-none">
          Bloco de Notas
        </span>
        {statusLabel ? (
          <span
            className={`text-[11px] pointer-events-none ${
              saveState === 'error' ? 'text-red-400' : 'text-white/45'
            }`}
          >
            {statusLabel}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onMinimize}
          className="w-8 h-7 rounded-md flex items-center justify-center text-white/70 hover:bg-white/10 transition-colors"
          title="Minimizar"
          aria-label="Minimizar"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-7 rounded-md flex items-center justify-center text-white/70 hover:bg-red-500/80 hover:text-white transition-colors"
          title="Fechar"
          aria-label="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 bg-[#1e1e1e]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-white/40">
            Carregando…
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => {
              const next = e.target.value;
              setContent(next);
              scheduleSave(next);
            }}
            spellCheck={false}
            placeholder="Digite suas anotações…"
            className="w-full h-full resize-none border-0 outline-none bg-transparent text-[13px] leading-relaxed text-[#e8e8e8] placeholder:text-white/25 p-4 font-mono"
            autoFocus
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
