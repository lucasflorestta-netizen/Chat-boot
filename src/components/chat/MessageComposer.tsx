import { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Send, Smile, Zap } from 'lucide-react';
import type { CannedResponse, Message } from '../../types';
import { autoCapitalize } from '../../lib/autoCapitalize';
import {
  applyWordReplacement,
  checkCompletedWord,
  prefetchSpellcheck,
  type SpellSuggestion,
} from '../../lib/spellcheck';
import { ReplyPreviewBar } from './ReplyPreviewBar';
import { VoiceRecorder } from './VoiceRecorder';

interface MessageComposerProps {
  contactName?: string | null;
  replyingTo: Message | null;
  onCancelReply: () => void;
  onSendText: (body: string) => Promise<void>;
  onPickFiles: (files: File[]) => void;
  onSendAudio: (blob: Blob, fileName: string) => Promise<void>;
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

  const canType = !voiceBusy;
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
        <EmojiPicker onSelect={(e) => setInput((prev) => autoCapitalize(prev + e))} />
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
      {uploading && (
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
                title="Emoji"
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

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const emojis = [
    '😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🔥', '✅', '❌',
    '🙏', '👏', '💯', '🎉', '😢', '😡', '⭐', '📞', '💬', '✨',
  ];
  return (
    <div className="absolute bottom-14 left-3 card p-2 shadow-xl z-30 animate-fade-in">
      <div className="grid grid-cols-7 gap-1">
        {emojis.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onSelect(e)}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-ink-700 text-lg"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
