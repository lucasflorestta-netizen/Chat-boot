import { useEffect, useMemo, useRef, useState } from 'react';
import { useContacts } from '../../hooks/useData';
import { useWhatsappConnection } from '../../context/useWhatsappConnection';
import { api } from '../../lib/api';
import {
  Search,
  Plus,
  RefreshCw,
  MessageSquare,
  Phone,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  StickyNote,
  Eye,
} from 'lucide-react';
import type { Contact } from '../../types';
import { ContactAvatar } from '../ContactAvatar';

interface ContactsViewProps {
  onStartConversation: (ticketId: string) => void;
}

type SyncResult = {
  synced?: number;
  withPhoto?: number;
  skipped?: boolean;
  photosPending?: boolean;
  reason?: 'in_progress' | 'empty_cache' | string;
};

type FormMode = 'create' | 'edit' | null;

function contactLetter(contact: Contact): string {
  const raw = (contact.name || contact.phone || '').trim();
  const first = raw.charAt(0).toLocaleUpperCase('pt-BR');
  const base = first.normalize('NFD').replace(/\p{M}/gu, '');
  return /^[A-Z]$/.test(base) ? base : '#';
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return phone || '—';
}

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export function ContactsView({ onStartConversation }: ContactsViewProps) {
  const { contacts, loading, refetch } = useContacts();
  const { connection } = useWhatsappConnection();
  const listRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmAssume, setConfirmAssume] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const photoRefreshAttempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selected) return;
    const fresh = contacts.find((c) => c.id === selected.id);
    if (!fresh) {
      setSelected(null);
      setConfirmDelete(false);
      setConfirmAssume(false);
      return;
    }
    if (
      fresh.name !== selected.name ||
      fresh.phone !== selected.phone ||
      fresh.notes !== selected.notes ||
      fresh.profile_pic_url !== selected.profile_pic_url
    ) {
      setSelected(fresh);
    }
  }, [contacts, selected]);

  // Sem foto local: pede refresh ao abrir o contato (uma vez por id).
  useEffect(() => {
    if (!selected?.id) return;
    if (selected.profile_pic_url) return;
    if (photoRefreshAttempted.current.has(selected.id)) return;
    photoRefreshAttempted.current.add(selected.id);
    void api(`/whatsapp/contacts/${selected.id}/refresh-photo`, { method: 'POST' })
      .then(() => refetch())
      .catch(() => {
        /* silencioso — privacidade WA / timeout */
      });
  }, [selected?.id, selected?.profile_pic_url, refetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.notes ?? '').toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const letter = contactLetter(c);
      const list = map.get(letter) ?? [];
      list.push(c);
      map.set(letter, list);
    }
    return LETTERS.filter((l) => map.has(l)).map((letter) => ({
      letter,
      contacts: map.get(letter)!,
    }));
  }, [filtered]);

  const activeLetters = useMemo(() => new Set(grouped.map((g) => g.letter)), [grouped]);

  const openCreate = () => {
    setFormMode('create');
    setFormName('');
    setFormPhone('');
    setFormNotes('');
    setError(null);
  };

  const openEdit = (contact: Contact) => {
    setFormMode('edit');
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormNotes(contact.notes ?? '');
    setError(null);
  };

  const closeForm = () => {
    setFormMode(null);
    setSaving(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formPhone.trim()) return;
    setSaving(true);
    setError(null);
    const phone = formPhone.replace(/\D/g, '');
    try {
      if (formMode === 'create') {
        await api('/contacts', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            phone,
            notes: formNotes.trim() || undefined,
          }),
        });
      } else if (formMode === 'edit' && selected) {
        await api(`/contacts/${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            phone,
            notes: formNotes.trim() || null,
          }),
        });
      }
      closeForm();
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar contato');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);

    if (connection?.status !== 'connected') {
      setSyncing(false);
      setError('WhatsApp desconectado. Conecte na aba Conexão WhatsApp para sincronizar a agenda.');
      return;
    }

    try {
      const result = await api<SyncResult>('/whatsapp/sync-contacts', {
        method: 'POST',
      });
      await refetch();

      if (result?.skipped) {
        if (result.reason === 'empty_cache') {
          setSyncMessage(
            'Agenda ainda vazia no dispositivo vinculado. Aguarde alguns segundos e tente sincronizar de novo, ou reconecte o WhatsApp.',
          );
        } else if (result.reason === 'in_progress') {
          setSyncMessage('Sincronização já em andamento. Aguarde um momento.');
        } else {
          setSyncMessage('Sincronização ignorada. Verifique a conexão do WhatsApp.');
        }
      } else {
        const synced = result?.synced ?? 0;
        setSyncMessage(
          `Agenda sincronizada. ${synced} contato${synced === 1 ? '' : 's'} atualizado${synced === 1 ? '' : 's'}${
            result?.photosPending ? ' (fotos em atualização)' : ''
          }.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handleStartConversation = async (contact: Contact) => {
    setError(null);
    setStarting(true);
    try {
      const ticket = await api<{ id: string }>(`/contacts/${contact.id}/start-conversation`, {
        method: 'POST',
        body: JSON.stringify({ assume: true }),
      });
      setConfirmAssume(false);
      setSelected(null);
      onStartConversation(ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar conversa');
      setConfirmAssume(false);
    } finally {
      setStarting(false);
    }
  };

  const handleViewConversation = async (contact: Contact) => {
    setError(null);
    setViewing(true);
    setConfirmAssume(false);
    try {
      const ticket = await api<{ id: string }>(`/contacts/${contact.id}/start-conversation`, {
        method: 'POST',
        body: JSON.stringify({ assume: false }),
      });
      setSelected(null);
      onStartConversation(ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir conversa');
    } finally {
      setViewing(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    setError(null);
    try {
      await api(`/contacts/${selected.id}`, { method: 'DELETE' });
      setConfirmDelete(false);
      setSelected(null);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir contato');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const scrollToLetter = (letter: string) => {
    const el = listRef.current?.querySelector(`[data-letter="${letter}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-4 md:p-6 gap-4">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">Contatos</h2>
          <p className="text-sm text-ink-300">{contacts.length} na agenda</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSync} disabled={syncing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo contato</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-3 flex items-start gap-2 text-sm text-danger-400 border-danger-500/30 bg-danger-500/10 flex-shrink-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="card p-3 text-sm text-ink-200 border-brand-500/30 bg-brand-500/10 flex-shrink-0">
          {syncMessage}
        </div>
      )}

      <div className="relative flex-shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nome ou telefone..."
          className="input pl-9"
        />
      </div>

      <div className="flex-1 min-h-0 relative flex">
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-ink-700 bg-ink-900/40"
        >
          {grouped.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-300">
              Nenhum contato encontrado. Conecte o WhatsApp e clique em Sincronizar para importar a agenda.
            </div>
          ) : (
            grouped.map(({ letter, contacts: section }) => (
              <section key={letter} data-letter={letter}>
                <div className="sticky top-0 z-10 px-4 py-1.5 text-xs font-semibold tracking-wide text-brand-400 bg-ink-800/95 border-b border-ink-700/80 backdrop-blur-sm">
                  {letter}
                </div>
                <ul>
                  {section.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(contact);
                          setConfirmDelete(false);
                          setConfirmAssume(false);
                          setError(null);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-ink-800/80 hover:bg-ink-800/60 transition-colors ${
                          selected?.id === contact.id ? 'bg-ink-800/80' : ''
                        }`}
                      >
                        <ContactAvatar
                          name={contact.name || contact.phone}
                          profilePicUrl={contact.profile_pic_url}
                          size="md"
                          rounded="full"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">
                            {contact.name || formatPhone(contact.phone)}
                          </p>
                          <p className="text-xs text-ink-300 truncate flex items-center gap-1">
                            <Phone className="w-3 h-3 flex-shrink-0" />
                            {formatPhone(contact.phone)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <nav
          className="hidden md:flex flex-col items-center justify-center gap-0.5 pl-2 pr-1 select-none"
          aria-label="Índice alfabético"
        >
          {LETTERS.filter((l) => l !== '#' || activeLetters.has('#')).map((letter) => {
            const enabled = activeLetters.has(letter);
            return (
              <button
                key={letter}
                type="button"
                disabled={!enabled}
                onClick={() => scrollToLetter(letter)}
                className={`text-[10px] leading-none px-0.5 font-semibold transition-colors ${
                  enabled ? 'text-brand-400 hover:text-brand-300' : 'text-ink-600 cursor-default'
                }`}
              >
                {letter}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Profile drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar"
            onClick={() => {
              setSelected(null);
              setConfirmDelete(false);
              setConfirmAssume(false);
            }}
          />
          <aside className="relative w-full max-w-md h-full bg-ink-900 border-l border-ink-700 shadow-2xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-ink-700">
              <h3 className="text-sm font-semibold text-white">Contato</h3>
              <button
                type="button"
                className="btn-ghost p-2"
                onClick={() => {
                  setSelected(null);
                  setConfirmDelete(false);
                  setConfirmAssume(false);
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex flex-col items-center text-center gap-3">
                <ContactAvatar
                  name={selected.name || selected.phone}
                  profilePicUrl={selected.profile_pic_url}
                  size="lg"
                  rounded="full"
                />
                <div>
                  <p className="text-lg font-semibold text-white">
                    {selected.name || formatPhone(selected.phone)}
                  </p>
                  <p className="text-sm text-ink-300 mt-1 flex items-center justify-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {formatPhone(selected.phone)}
                  </p>
                </div>
              </div>

              {selected.notes && (
                <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-4">
                  <p className="text-xs font-medium text-ink-300 flex items-center gap-1.5 mb-2">
                    <StickyNote className="w-3.5 h-3.5" />
                    Notas
                  </p>
                  <p className="text-sm text-ink-100 whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}

              <div className="grid gap-2">
                <button
                  type="button"
                  className="btn-secondary w-full justify-center"
                  onClick={() => handleViewConversation(selected)}
                  disabled={viewing || starting}
                >
                  {viewing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  Visualizar conversa
                </button>
                {!confirmAssume ? (
                  <button
                    type="button"
                    className="btn-primary w-full justify-center"
                    onClick={() => {
                      setConfirmAssume(true);
                      setConfirmDelete(false);
                      setError(null);
                    }}
                    disabled={viewing || starting}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Conversar
                  </button>
                ) : (
                  <div className="rounded-xl border border-brand-500/40 bg-brand-500/10 p-3 space-y-3">
                    <p className="text-sm text-ink-100">
                      Deseja assumir o atendimento de{' '}
                      <span className="font-semibold text-white">
                        {selected.name || formatPhone(selected.phone)}
                      </span>
                      ?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-ghost flex-1 justify-center"
                        onClick={() => setConfirmAssume(false)}
                        disabled={starting}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn-primary flex-1 justify-center"
                        onClick={() => handleStartConversation(selected)}
                        disabled={starting}
                      >
                        {starting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Assumir'
                        )}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="btn-secondary w-full justify-center"
                  onClick={() => openEdit(selected)}
                >
                  <Pencil className="w-4 h-4" />
                  Editar
                </button>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="btn-ghost w-full justify-center text-danger-400 hover:text-danger-300"
                    onClick={() => {
                      setConfirmDelete(true);
                      setConfirmAssume(false);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </button>
                ) : (
                  <div className="rounded-xl border border-danger-500/40 bg-danger-500/10 p-3 space-y-3">
                    <p className="text-sm text-danger-300">
                      Excluir este contato da agenda? Não é possível se houver atendimentos vinculados.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-ghost flex-1 justify-center"
                        onClick={() => setConfirmDelete(false)}
                        disabled={deleting}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn-primary flex-1 justify-center bg-danger-600 hover:bg-danger-500"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Create / Edit modal */}
      {formMode && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 animate-fade-in"
          onClick={closeForm}
        >
          <div
            className="card w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {formMode === 'create' ? 'Novo contato' : 'Editar contato'}
              </h3>
              <button type="button" className="btn-ghost p-2" onClick={closeForm}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="label">Nome</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input"
                placeholder="Nome do contato"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="input"
                placeholder="5511999999999"
              />
            </div>
            <div>
              <label className="label">Notas (opcional)</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="input min-h-[80px] resize-y"
                placeholder="Observações internas"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost" onClick={closeForm} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formPhone.trim()}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
