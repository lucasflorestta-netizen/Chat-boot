import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Square, StickyNote, X } from 'lucide-react';
import { api } from '../../lib/api';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type NotepadTab = {
  id: string;
  title: string;
  content: string;
  saveState: SaveState;
};

type NoteDto = { id: string; title: string; content: string };

export interface NotepadWindowProps {
  windowKey: string;
  minimized: boolean;
  zIndex: number;
  offset: number;
  onClose: (windowKey: string) => void;
  onMinimize: (windowKey: string) => void;
  onRestore: (windowKey: string) => void;
  onFocus: (windowKey: string) => void;
  dockIndex: number;
}

const DEFAULT_W = 560;
const DEFAULT_H = 440;
const MIN_W = 360;
const MIN_H = 280;

function titleFromContent(content: string): string {
  const line = content.split(/\r?\n/).find((l) => l.trim())?.trim() ?? '';
  if (!line) return 'Sem título';
  return line.length > 28 ? `${line.slice(0, 28)}…` : line;
}

function countStats(content: string) {
  const lines = content.length === 0 ? 1 : content.split(/\r?\n/).length;
  return { lines, chars: content.length };
}

export function NotepadWindow({
  windowKey,
  minimized,
  zIndex,
  offset,
  onClose,
  onMinimize,
  onRestore,
  onFocus,
  dockIndex,
}: NotepadWindowProps) {
  const [tabs, setTabs] = useState<NotepadTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [pos, setPos] = useState({
    x: 96 + (offset % 3) * (DEFAULT_W + 20),
    y: 72 + Math.floor(offset / 3) * 36,
  });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [preMax, setPreMax] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    originW: number;
    originH: number;
  } | null>(null);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveGenRef = useRef<Map<string, number>>(new Map());
  const closingRef = useRef(false);

  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const persistTab = useCallback(async (tabId: string, content: string, title: string) => {
    const nextGen = (saveGenRef.current.get(tabId) ?? 0) + 1;
    saveGenRef.current.set(tabId, nextGen);
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, saveState: 'saving' } : t)),
    );
    try {
      await api(`/notepad/${tabId}`, {
        method: 'PUT',
        body: JSON.stringify({ content, title }),
      });
      if (saveGenRef.current.get(tabId) !== nextGen) return;
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, saveState: 'saved', title } : t)),
      );
    } catch {
      if (saveGenRef.current.get(tabId) !== nextGen) return;
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, saveState: 'error' } : t)),
      );
    }
  }, []);

  const scheduleSave = useCallback(
    (tabId: string, content: string) => {
      const title = titleFromContent(content);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, content, title, saveState: 'dirty' } : t,
        ),
      );
      const prevTimer = saveTimersRef.current.get(tabId);
      if (prevTimer) clearTimeout(prevTimer);
      const timer = setTimeout(() => {
        saveTimersRef.current.delete(tabId);
        void persistTab(tabId, content, title);
      }, 700);
      saveTimersRef.current.set(tabId, timer);
    },
    [persistTab],
  );

  const flushTab = useCallback(
    (tabId: string) => {
      const timer = saveTimersRef.current.get(tabId);
      if (timer) {
        clearTimeout(timer);
        saveTimersRef.current.delete(tabId);
      }
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab && tab.saveState === 'dirty') {
        void persistTab(tab.id, tab.content, titleFromContent(tab.content));
      }
    },
    [persistTab],
  );

  const createTab = useCallback(async (): Promise<NotepadTab | null> => {
    try {
      const created = await api<NoteDto>('/notepad', {
        method: 'POST',
        body: JSON.stringify({ title: 'Sem título', content: '' }),
      });
      return {
        id: created.id,
        title: created.title || 'Sem título',
        content: created.content ?? '',
        saveState: 'idle',
      };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBooting(true);
      setBootError(null);
      const tab = await createTab();
      if (cancelled) {
        if (tab) {
          void api(`/notepad/${tab.id}`, { method: 'DELETE' }).catch(() => undefined);
        }
        return;
      }
      if (!tab) {
        setBootError('Não foi possível abrir o bloco de notas');
        setBooting(false);
        return;
      }
      setTabs([tab]);
      setActiveTabId(tab.id);
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [createTab, windowKey]);

  useEffect(() => {
    return () => {
      for (const timer of saveTimersRef.current.values()) clearTimeout(timer);
      saveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!minimized) return;
    for (const tab of tabsRef.current) flushTab(tab.id);
  }, [minimized, flushTab]);

  const addTab = async () => {
    onFocus(windowKey);
    const tab = await createTab();
    if (!tab) return;
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = async (tabId: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    const timer = saveTimersRef.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      saveTimersRef.current.delete(tabId);
    }
    const remaining = tabsRef.current.filter((t) => t.id !== tabId);
    setTabs(remaining);
    if (activeTabIdRef.current === tabId) {
      setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
    }
    try {
      await api(`/notepad/${tabId}`, { method: 'DELETE' });
    } catch {
      /* already gone */
    }
    if (remaining.length === 0) {
      onClose(windowKey);
    }
  };

  const closeWindow = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    for (const timer of saveTimersRef.current.values()) clearTimeout(timer);
    saveTimersRef.current.clear();
    const ids = tabsRef.current.map((t) => t.id);
    onClose(windowKey);
    if (ids.length > 0) {
      try {
        await api('/notepad', {
          method: 'DELETE',
          body: JSON.stringify({ ids }),
        });
      } catch {
        await Promise.all(
          ids.map((id) =>
            api(`/notepad/${id}`, { method: 'DELETE' }).catch(() => undefined),
          ),
        );
      }
    }
  };

  const toggleMaximize = () => {
    if (maximized) {
      if (preMax) {
        setPos({ x: preMax.x, y: preMax.y });
        setSize({ w: preMax.w, h: preMax.h });
      }
      setMaximized(false);
      setPreMax(null);
      return;
    }
    setPreMax({ x: pos.x, y: pos.y, w: size.w, h: size.h });
    setPos({ x: 16, y: 16 });
    setSize({
      w: Math.max(MIN_W, window.innerWidth - 32),
      h: Math.max(MIN_H, window.innerHeight - 32),
    });
    setMaximized(true);
  };

  const onPointerDownTitle = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (maximized) return;
    onFocus(windowKey);
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
      x: Math.max(0, dragRef.current.originX + dx),
      y: Math.max(0, dragRef.current.originY + dy),
    });
  };

  const onPointerUpTitle = () => {
    dragRef.current = null;
  };

  const onPointerDownResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (maximized) return;
    onFocus(windowKey);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originW: size.w,
      originH: size.h,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMoveResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    setSize({
      w: Math.max(MIN_W, resizeRef.current.originW + dx),
      h: Math.max(MIN_H, resizeRef.current.originH + dy),
    });
  };

  const onPointerUpResize = () => {
    resizeRef.current = null;
  };

  const stats = countStats(activeTab?.content ?? '');
  const statusLabel =
    activeTab?.saveState === 'saving'
      ? 'Salvando…'
      : activeTab?.saveState === 'saved'
        ? 'Salvo'
        : activeTab?.saveState === 'dirty'
          ? 'Não salvo'
          : activeTab?.saveState === 'error'
            ? 'Erro ao salvar'
            : '';

  if (minimized) {
    const label = activeTab?.title || 'Bloco de Notas';
    return createPortal(
      <button
        type="button"
        onClick={() => onRestore(windowKey)}
        className="fixed left-4 z-[70] flex items-center gap-2 rounded-lg border border-white/10 bg-[#2c2c2c]/95 px-3 py-2 text-sm text-white shadow-xl backdrop-blur-md hover:bg-[#383838] animate-fade-in"
        style={{ bottom: `${16 + dockIndex * 48}px` }}
        title={`Restaurar ${label}`}
      >
        <StickyNote className="w-4 h-4 text-amber-300" />
        <span className="max-w-[160px] truncate">{label}</span>
        {tabs.length > 1 ? (
          <span className="text-[10px] text-white/45">{tabs.length}</span>
        ) : null}
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed flex flex-col overflow-hidden rounded-xl border border-[#3a3a3a] shadow-2xl animate-fade-in"
      style={{
        left: pos.x,
        top: pos.y,
        zIndex,
        width: size.w,
        height: size.h,
        background: '#202020',
      }}
      role="dialog"
      aria-label="Bloco de Notas"
      onMouseDown={() => onFocus(windowKey)}
    >
      {/* Title / tab strip — Win11 style */}
      <div
        className="flex items-stretch gap-0 h-11 select-none cursor-grab active:cursor-grabbing bg-[#2c2c2c] border-b border-[#3a3a3a]"
        onPointerDown={onPointerDownTitle}
        onPointerMove={onPointerMoveTitle}
        onPointerUp={onPointerUpTitle}
        onPointerCancel={onPointerUpTitle}
        onDoubleClick={toggleMaximize}
      >
        <div className="flex items-end flex-1 min-w-0 pl-1.5 pt-1.5 gap-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={(e) => {
                  e.stopPropagation();
                  onFocus(windowKey);
                  flushTab(activeTabIdRef.current ?? '');
                  setActiveTabId(tab.id);
                }}
                className={`group relative flex items-center gap-1.5 h-8 max-w-[180px] min-w-[96px] px-2.5 rounded-t-md cursor-pointer ${
                  active
                    ? 'bg-[#202020] text-white'
                    : 'bg-transparent text-white/55 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                <StickyNote className="w-3 h-3 text-amber-300/90 flex-shrink-0" />
                <span className="flex-1 truncate text-[12px] font-medium">
                  {tab.title || 'Sem título'}
                </span>
                <button
                  type="button"
                  onClick={(e) => void closeTab(tab.id, e)}
                  className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Fechar aba"
                  aria-label="Fechar aba"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void addTab();
            }}
            className="mb-0.5 ml-0.5 w-8 h-7 rounded-md flex items-center justify-center text-white/55 hover:bg-white/10 hover:text-white transition-colors flex-shrink-0"
            title="Nova aba"
            aria-label="Nova aba"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 pr-1.5 pl-2 flex-shrink-0">
          {statusLabel ? (
            <span
              className={`text-[10px] mr-1 pointer-events-none ${
                activeTab?.saveState === 'error' ? 'text-red-400' : 'text-white/40'
              }`}
            >
              {statusLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onMinimize(windowKey)}
            className="w-10 h-8 rounded-md flex items-center justify-center text-white/70 hover:bg-white/10 transition-colors"
            title="Minimizar"
            aria-label="Minimizar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleMaximize}
            className="w-10 h-8 rounded-md flex items-center justify-center text-white/70 hover:bg-white/10 transition-colors"
            title={maximized ? 'Restaurar' : 'Maximizar'}
            aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => void closeWindow()}
            className="w-10 h-8 rounded-md flex items-center justify-center text-white/70 hover:bg-red-500 hover:text-white transition-colors"
            title="Fechar janela"
            aria-label="Fechar janela"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-[#1e1e1e] relative">
        {booting ? (
          <div className="h-full flex items-center justify-center text-sm text-white/40">
            Abrindo…
          </div>
        ) : bootError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-red-300 px-4 text-center">
            <span>{bootError}</span>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/15"
              onClick={() => void closeWindow()}
            >
              Fechar
            </button>
          </div>
        ) : (
          <textarea
            key={activeTab?.id ?? 'empty'}
            value={activeTab?.content ?? ''}
            onChange={(e) => {
              if (!activeTab) return;
              scheduleSave(activeTab.id, e.target.value);
            }}
            spellCheck={false}
            placeholder="Digite suas anotações…"
            className="w-full h-full resize-none border-0 outline-none bg-transparent text-[14px] leading-relaxed text-[#e8e8e8] placeholder:text-white/25 p-4 font-sans"
            autoFocus
          />
        )}
      </div>

      <div className="h-7 flex items-center gap-3 px-3 text-[11px] text-white/40 bg-[#2c2c2c] border-t border-[#3a3a3a] select-none">
        <span>
          Ln {stats.lines}, Col 1
        </span>
        <span className="text-white/20">|</span>
        <span>
          {stats.chars} caractere{stats.chars === 1 ? '' : 's'}
        </span>
        <span className="text-white/20">|</span>
        <span>Texto sem formatação</span>
        <span className="ml-auto text-white/30">UTF-8</span>
      </div>

      {!maximized ? (
        <div
          className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize"
          onPointerDown={onPointerDownResize}
          onPointerMove={onPointerMoveResize}
          onPointerUp={onPointerUpResize}
          onPointerCancel={onPointerUpResize}
          aria-hidden
        />
      ) : null}
    </div>,
    document.body,
  );
}
