import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, Plus, Send, Smile, Zap } from 'lucide-react';
import type { CannedResponse, Message } from '../../types';
import { autoCapitalize } from '../../lib/autoCapitalize';
import { mediaUrl } from '../../lib/api';
import {
  applyWordReplacement,
  checkCompletedWord,
  prefetchSpellcheck,
  type SpellSuggestion,
} from '../../lib/spellcheck';
import type { RecentSticker } from '../../lib/recentStickers';
import { ReplyPreviewBar } from './ReplyPreviewBar';
import { VoiceRecorder } from './VoiceRecorder';

interface MessageComposerProps {
  contactName?: string | null;
  replyingTo: Message | null;
  onCancelReply: () => void;
  onSendText: (body: string) => Promise<void>;
  onPickFiles: (files: File[]) => void;
  onSendAudio: (blob: Blob, fileName: string) => Promise<void>;
  onSendSticker: (file: File) => Promise<void>;
  onSendStickerUrl: (url: string) => Promise<void>;
  recentStickers: RecentSticker[];
  canned: CannedResponse[];
  disabled?: boolean;
  uploading?: boolean;
  placeholder?: string;
}

export function MessageComposer({
  contactName,
  replyingTo,
  onCancelReply,
  onSendText,
  onPickFiles,
  onSendAudio,
  onSendSticker,
  onSendStickerUrl,
  recentStickers,
  canned,
  disabled,
  uploading = false,
  placeholder = 'Digite uma mensagem... (use / para respostas rápidas)',
}: MessageComposerProps) {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [spellHint, setSpellHint] = useState<SpellSuggestion | null>(null);
  const [stickerBusy, setStickerBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const spellRequestId = useRef(0);

  useEffect(() => {
    prefetchSpellcheck();
  }, []);

  useEffect(() => {
    if (!disabled) return;
    setInput('');
    setShowEmoji(false);
    setShowCanned(false);
    setSpellHint(null);
    setStickerBusy(false);
  }, [disabled]);

  const restoreCursor = (pos: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.setSelectionRange(pos, pos);
    });
  };

  const runSpellcheck = (value: string, cursor: number) => {
    const id = ++spellRequestId.current;
    void checkCompletedWord(value, cursor).then((hint) => {
      if (id !== spellRequestId.current) return;
      setSpellHint(hint);
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const el = e.target;
    const cursor = el.selectionStart ?? el.value.length;
    const next = autoCapitalize(el.value);
    setInput(next);
    restoreCursor(cursor);

    if (showCanned || showEmoji) {
      setSpellHint(null);
      return;
    }
    runSpellcheck(next, cursor);
  };

  const applySuggestion = (suggestion: string) => {
    if (!spellHint) return;
    const next = applyWordReplacement(
      input,
      spellHint.start,
      spellHint.end,
      suggestion,
    );
    setInput(next);
    setSpellHint(null);
    const newPos = spellHint.start + suggestion.length;
    restoreCursor(newPos);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    if (!input.trim() || uploading || disabled) return;
    const body = input.trim();
    setInput('');
    setShowEmoji(false);
    setShowCanned(false);
    setSpellHint(null);
    setError(null);
    try {
      await onSendText(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem');
      setInput(body);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = '';
    if (!list?.length) return;
    setError(null);
    onPickFiles(Array.from(list));
  };

  const handleAudio = async (blob: Blob, fileName: string) => {
    setError(null);
    try {
      await onSendAudio(blob, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar áudio');
    }
  };

  const handleStickerFile = async (file: File) => {
    setError(null);
    setStickerBusy(true);
    try {
      await onSendSticker(file);
      setShowEmoji(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar figurinha');
    } finally {
      setStickerBusy(false);
    }
  };

  const handleStickerRecent = async (url: string) => {
    setError(null);
    setStickerBusy(true);
    try {
      await onSendStickerUrl(url);
      setShowEmoji(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar figurinha');
    } finally {
      setStickerBusy(false);
    }
  };

  const canType = !voiceBusy;
  const panelBusy = uploading || stickerBusy;
  const showSpellChips = Boolean(spellHint && !showCanned && !showEmoji && canType && !disabled);

  return (
    <div className="border-t border-ink-700 bg-ink-900 p-3 relative">
      {showCanned && canType && !disabled && (
        <div className="mb-2 max-h-48 overflow-y-auto card p-1.5">
          {canned.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setInput(c.body);
                setShowCanned(false);
              }}
              className="w-full text-left px-2.5 py-2 rounded-md hover:bg-ink-700 text-sm"
            >
              <span className="text-brand-400 font-mono text-xs">{c.shortcut}</span>
              <span className="text-ink-200 ml-2">{c.title}</span>
            </button>
          ))}
          {canned.length === 0 && (
            <p className="text-xs text-ink-300 px-2 py-1">Nenhuma resposta rápida cadastrada.</p>
          )}
        </div>
      )}

      {showEmoji && canType && !disabled && (
        <EmojiStickerPanel
          recentStickers={recentStickers}
          busy={panelBusy}
          onSelectEmoji={(e) => setInput((prev) => autoCapitalize(prev + e))}
          onPickStickerFile={(file) => {
            void handleStickerFile(file);
          }}
          onSelectRecent={(url) => {
            void handleStickerRecent(url);
          }}
        />
      )}

      {showSpellChips && spellHint && (
        <div className="mb-2 card p-1.5 animate-fade-in">
          <p className="text-xs text-ink-300 px-2 py-1">
            Correções para <span className="text-ink-100">“{spellHint.word}”</span>
          </p>
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {spellHint.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => applySuggestion(s)}
                className="px-2.5 py-1.5 rounded-md text-sm hover:bg-ink-700 text-ink-100"
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSpellHint(null)}
              className="px-2.5 py-1.5 rounded-md text-xs text-ink-400 hover:bg-ink-700"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {replyingTo && (
        <ReplyPreviewBar
          message={replyingTo}
          contactName={contactName}
          onCancel={onCancelReply}
        />
      )}

      {error && <p className="text-xs text-danger-400 mb-1">{error}</p>}
      {(uploading || stickerBusy) && (
        <p className="text-xs text-ink-300 mb-1 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Enviando…
        </p>
      )}

      <div className="flex items-end gap-1.5">
        {canType && (
          <>
            <div className="flex gap-0.5">
              <label
                className={`btn-ghost p-2 rounded-lg ${uploading || disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
                title="Enviar arquivo(s)"
              >
                <Paperclip className="w-4 h-4" />
                <input
                  type="file"
                  className="hidden"
                  multiple
                  disabled={uploading || disabled}
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv"
                  onChange={handleFilePick}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowEmoji(!showEmoji);
                  setShowCanned(false);
                  setSpellHint(null);
                }}
                className="btn-ghost p-2 rounded-lg"
                title="Emoji e figurinhas"
                disabled={disabled}
              >
                <Smile className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCanned(!showCanned);
                  setShowEmoji(false);
                  setSpellHint(null);
                }}
                className="btn-ghost p-2 rounded-lg"
                title="Respostas rápidas"
                disabled={disabled}
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onBlur={() => {
                const el = textareaRef.current;
                if (!el || showCanned || showEmoji) return;
                runSpellcheck(el.value, el.selectionStart ?? el.value.length);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={placeholder}
              rows={1}
              disabled={disabled || uploading}
              readOnly={disabled}
              spellCheck
              lang="pt-BR"
              autoCapitalize="sentences"
              className={`input flex-1 resize-none max-h-32 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </>
        )}

        {input.trim() && canType && !disabled ? (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={uploading || disabled}
            className="btn-primary p-2.5 rounded-lg"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <div className={voiceBusy ? 'flex-1' : undefined}>
            <VoiceRecorder
              disabled={disabled || uploading}
              onBusyChange={setVoiceBusy}
              onRecorded={(blob, name) => {
                void handleAudio(blob, name);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type PanelTab = 'emoji' | 'stickers';

function EmojiStickerPanel({
  recentStickers,
  busy,
  onSelectEmoji,
  onPickStickerFile,
  onSelectRecent,
}: {
  recentStickers: RecentSticker[];
  busy: boolean;
  onSelectEmoji: (emoji: string) => void;
  onPickStickerFile: (file: File) => void;
  onSelectRecent: (url: string) => void;
}) {
  const [tab, setTab] = useState<PanelTab>('emoji');

  const emojis = useMemo(
    () => [
      '😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🔥', '✅', '❌',
      '🙏', '👏', '💯', '🎉', '😢', '😡', '⭐', '📞', '💬', '✨',
    ],
    [],
  );

  const handleStickerInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const name = file.name.toLowerCase();
    const isWebp =
      file.type === 'image/webp' || name.endsWith('.webp');
    if (!isWebp) {
      return;
    }
    onPickStickerFile(file);
  };

  return (
    <div className="absolute bottom-14 left-3 w-[min(100%,20rem)] card p-0 shadow-xl z-30 animate-fade-in overflow-hidden">
      <div className="flex border-b border-ink-700">
        <button
          type="button"
          onClick={() => setTab('emoji')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'emoji'
              ? 'text-brand-400 border-b-2 border-brand-400 bg-ink-800/50'
              : 'text-ink-300 hover:text-ink-100'
          }`}
        >
          Emoji
        </button>
        <button
          type="button"
          onClick={() => setTab('stickers')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'stickers'
              ? 'text-brand-400 border-b-2 border-brand-400 bg-ink-800/50'
              : 'text-ink-300 hover:text-ink-100'
          }`}
        >
          Figurinhas
        </button>
      </div>

      <div className="p-2">
        {tab === 'emoji' ? (
          <div className="grid grid-cols-7 gap-1">
            {emojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onSelectEmoji(e)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-ink-700 text-lg"
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <p className="text-[11px] text-ink-400 uppercase tracking-wide">Recentes</p>
              <label
                className={`inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 cursor-pointer ${
                  busy ? 'opacity-50 pointer-events-none' : ''
                }`}
                title="Adicionar figurinha (.webp)"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
                <input
                  type="file"
                  className="hidden"
                  accept="image/webp,.webp"
                  disabled={busy}
                  onChange={handleStickerInput}
                />
              </label>
            </div>

            {recentStickers.length === 0 ? (
              <p className="text-xs text-ink-400 px-1 py-3 text-center">
                Nenhuma figurinha recente — adicione um arquivo .webp
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
                {recentStickers.map((s) => {
                  const src = mediaUrl(s.url) ?? s.url;
                  return (
                    <button
                      key={s.url}
                      type="button"
                      disabled={busy}
                      onClick={() => onSelectRecent(s.url)}
                      className="aspect-square rounded-lg overflow-hidden hover:bg-ink-700/80 disabled:opacity-50 p-1"
                      title="Enviar figurinha"
                    >
                      <img
                        src={src}
                        alt="Figurinha"
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
