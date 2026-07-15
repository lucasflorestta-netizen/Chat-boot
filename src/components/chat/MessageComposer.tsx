import { useState } from 'react';
import { Loader2, Paperclip, Send, Smile, Zap } from 'lucide-react';
import type { CannedResponse, Message } from '../../types';
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
}: MessageComposerProps) {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || uploading || disabled) return;
    const body = input.trim();
    setInput('');
    setShowEmoji(false);
    setShowCanned(false);
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

  return (
    <div className="border-t border-ink-700 bg-ink-900 p-3 relative">
      {showCanned && canType && (
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

      {showEmoji && canType && (
        <EmojiPicker onSelect={(e) => setInput((prev) => prev + e)} />
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
                onClick={() => setShowEmoji(!showEmoji)}
                className="btn-ghost p-2 rounded-lg"
                title="Emoji"
                disabled={disabled}
              >
                <Smile className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowCanned(!showCanned)}
                className="btn-ghost p-2 rounded-lg"
                title="Respostas rápidas"
                disabled={disabled}
              >
                <Zap className="w-4 h-4" />
              </button>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Digite uma mensagem... (use / para respostas rápidas)"
              rows={1}
              disabled={disabled || uploading}
              className="input flex-1 resize-none max-h-32"
            />
          </>
        )}

        {input.trim() && canType ? (
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
