import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  Send,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ContactAvatar } from '../ContactAvatar';
import type { WhatsappGroup, WhatsappGroupMessage } from '../../types';

export function GroupsView() {
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappGroupMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<WhatsappGroup[]>('/whatsapp/groups');
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      setGroups([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar grupos');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (groupJid: string, silent = false) => {
    if (!silent) setMessagesLoading(true);
    try {
      const data = await api<WhatsappGroupMessage[]>(
        `/whatsapp/groups/${encodeURIComponent(groupJid)}/messages`,
      );
      if (selectedIdRef.current === groupJid) {
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      if (!silent && selectedIdRef.current === groupJid) {
        setMessages([]);
        setError(e instanceof Error ? e.message : 'Falha ao carregar mensagens');
      }
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    const timer = setInterval(() => {
      void loadMessages(selectedId, true);
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.subject.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q),
    );
  }, [groups, search]);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  const handleSend = async () => {
    if (!selectedId || !input.trim() || sending) return;
    const text = input.trim();
    setSending(true);
    setError(null);
    try {
      const sent = await api<WhatsappGroupMessage>(
        `/whatsapp/groups/${encodeURIComponent(selectedId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        },
      );
      setInput('');
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      <aside className="w-80 border-r border-ink-700 flex flex-col bg-ink-900/40">
        <div className="p-4 border-b border-ink-700 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Grupos</h2>
              <p className="text-xs text-ink-400">
                {groups.length} grupo{groups.length === 1 ? '' : 's'} do WhatsApp
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadGroups()}
              className="btn-ghost p-2"
              title="Atualizar lista"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 w-full"
              placeholder="Buscar grupo..."
            />
          </div>
        </div>

        {error && !selected && (
          <div className="m-3 p-3 rounded-lg bg-danger-500/10 border border-danger-500/30 text-sm text-danger-300 flex items-start gap-2">
            <WifiOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-ink-400 text-sm">
              {error
                ? 'Não foi possível listar os grupos. Verifique a conexão WhatsApp.'
                : 'Nenhum grupo encontrado.'}
            </div>
          ) : (
            filtered.map((group) => {
              const active = group.id === selectedId;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSelectedId(group.id);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-ink-800 transition-colors ${
                    active
                      ? 'bg-brand-600/20 border-l-2 border-l-brand-500'
                      : 'hover:bg-ink-800/60'
                  }`}
                >
                  <ContactAvatar
                    name={group.subject}
                    profilePicUrl={group.profilePicUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {group.subject}
                    </p>
                    <p className="text-xs text-ink-400 truncate">
                      {group.participantsCount} participante
                      {group.participantsCount === 1 ? '' : 's'}
                      {group.description ? ` · ${group.description}` : ''}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 bg-ink-950">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-400 gap-3">
            <UsersRound className="w-12 h-12 text-ink-600" />
            <p className="text-sm">Selecione um grupo para conversar</p>
          </div>
        ) : (
          <>
            <header className="px-4 py-3 border-b border-ink-700 flex items-center gap-3">
              <ContactAvatar
                name={selected.subject}
                profilePicUrl={selected.profilePicUrl}
                size="sm"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">
                  {selected.subject}
                </h3>
                <p className="text-xs text-ink-400">
                  {selected.participantsCount} participantes
                </p>
              </div>
            </header>

            {error && (
              <div className="mx-4 mt-3 p-2 rounded-lg bg-danger-500/10 border border-danger-500/30 text-xs text-danger-300">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-3">
              {messagesLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-ink-500 text-sm py-10 px-4">
                  Nenhuma mensagem recente neste grupo ainda.
                  <br />
                  Mensagens novas aparecerão aqui enquanto o WhatsApp estiver conectado.
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'} my-1 px-3`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                        message.fromMe
                          ? 'bg-brand-600 text-white rounded-br-md'
                          : 'bg-ink-800 text-ink-100 rounded-bl-md border border-ink-700'
                      }`}
                    >
                      {!message.fromMe && (
                        <p className="text-[11px] font-semibold text-brand-300 mb-0.5">
                          {message.senderName?.trim() ||
                            message.senderJid?.split('@')[0] ||
                            'Participante'}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.text}
                      </p>
                      <span
                        className={`text-[10px] mt-1 block ${
                          message.fromMe ? 'text-white/70' : 'text-ink-400'
                        }`}
                      >
                        {new Date(message.timestamp).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <footer className="p-3 border-t border-ink-700">
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={1}
                  className="input flex-1 resize-none min-h-[42px] max-h-32"
                  placeholder="Escreva uma mensagem para o grupo..."
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="btn-primary h-[42px] px-4"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
