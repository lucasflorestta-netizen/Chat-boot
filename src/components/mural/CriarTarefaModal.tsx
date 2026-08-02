import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Contact, MuralTaskPriority, Profile } from '../../types';

const MURAL_POOL = '__mural__';

type PriorityValue = MuralTaskPriority;

interface ConversaOption {
  id: string;
  protocolo: string | null;
  contact_id: string;
  contactName: string;
  agentName: string;
}

const PRIORITIES: {
  value: PriorityValue;
  label: string;
  active: string;
  idle: string;
}[] = [
  {
    value: 'LOW',
    label: 'Baixa',
    active: 'bg-blue-600 border-blue-500 text-white',
    idle: 'bg-[#151A27] border-[#2A3245] text-ink-200 hover:border-blue-500/50',
  },
  {
    value: 'MEDIUM',
    label: 'Média',
    active: 'bg-yellow-500 border-yellow-400 text-ink-950',
    idle: 'bg-[#151A27] border-[#2A3245] text-ink-200 hover:border-yellow-500/50',
  },
  {
    value: 'HIGH',
    label: 'Alta',
    active: 'bg-orange-500 border-orange-400 text-white',
    idle: 'bg-[#151A27] border-[#2A3245] text-ink-200 hover:border-orange-500/50',
  },
  {
    value: 'URGENT',
    label: 'Urgente',
    active: 'bg-red-600 border-red-500 text-white',
    idle: 'bg-[#151A27] border-[#2A3245] text-ink-200 hover:border-red-500/50',
  },
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function todayParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full"
    >
      <span className="text-sm text-ink-100">{label}</span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-[#2A3245]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

export interface CriarTarefaModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CriarTarefaModal({ open, onClose, onCreated }: CriarTarefaModalProps) {
  const defaults = todayParts();
  const [titulo, setTitulo] = useState('');
  const [tituloTouched, setTituloTouched] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [clienteQ, setClienteQ] = useState('');
  const [clienteOpen, setClienteOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversaId, setConversaId] = useState('');
  const [tickets, setTickets] = useState<ConversaOption[]>([]);
  const [atribuidoId, setAtribuidoId] = useState(MURAL_POOL);
  const [users, setUsers] = useState<Profile[]>([]);
  const [prioridade, setPrioridade] = useState<PriorityValue>('MEDIUM');
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [notaInterna, setNotaInterna] = useState('');
  const [notificar, setNotificar] = useState(true);
  const [repetir, setRepetir] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOpts, setLoadingOpts] = useState(false);
  const clienteBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!clienteOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!clienteBoxRef.current?.contains(e.target as Node)) {
        setClienteOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [clienteOpen]);

  useEffect(() => {
    if (!open) return;
    const d = todayParts();
    setTitulo('');
    setTituloTouched(false);
    setClienteId('');
    setClienteQ('');
    setClienteOpen(false);
    setConversaId('');
    setAtribuidoId(MURAL_POOL);
    setPrioridade('MEDIUM');
    setDate(d.date);
    setTime(d.time);
    setNotaInterna('');
    setNotificar(true);
    setRepetir(false);
    setError(null);
    setSubmitting(false);

    let cancelled = false;
    setLoadingOpts(true);
    void (async () => {
      try {
        const [cRes, tRes, uRes] = await Promise.all([
          api<any[]>('/contacts'),
          api<any>('/tickets?inbox=abertos'),
          api<any[]>('/users'),
        ]);
        if (cancelled) return;
        const contactList = (Array.isArray(cRes) ? cRes : []).map((c) => ({
          id: c.id,
          name: c.displayName || c.name || c.phone || 'Cliente',
          phone: c.phone || '',
          whatsapp_lid: c.whatsappLid ?? c.whatsapp_lid ?? null,
          profile_pic_url: c.profilePicUrl ?? c.profile_pic_url ?? null,
          notes: c.notes ?? null,
          wa_conversation_at: null,
          wa_archived: false,
          created_at: c.createdAt ?? '',
          updated_at: c.updatedAt ?? '',
        })) as Contact[];
        setContacts(contactList);

        const rawTickets = Array.isArray(tRes)
          ? tRes
          : Array.isArray(tRes?.items)
            ? tRes.items
            : [];
        setTickets(
          rawTickets.map((t: any): ConversaOption => ({
            id: t.id,
            protocolo: t.protocolo ?? t.protocol ?? null,
            contact_id: t.contactId ?? t.contact_id,
            contactName:
              t.contact?.displayName ||
              t.contact?.name ||
              t.contact?.phone ||
              'Cliente',
            agentName:
              t.assignee?.name ||
              t.assigned_agent?.name ||
              'Sem atendente',
          })),
        );

        setUsers(
          (Array.isArray(uRes) ? uRes : []).map((u) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email ?? null,
            role: u.role === 'ADMIN' || u.role === 'admin' ? 'admin' : 'agent',
            apiRole: u.role,
            department: 'support',
            sectorIds: [],
            sectors: [],
            max_concurrent_chats: 3,
            ramal: null,
            work_start: null,
            work_end: null,
            lunch_start: null,
            lunch_end: null,
            lunch_return_required: false,
            status: u.status ?? 'OFFLINE',
            avatar_url: u.avatarUrl ?? u.avatar_url ?? null,
            is_active: u.isActive !== false && u.is_active !== false,
            created_at: '',
          })) as Profile[],
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar opções');
        }
      } finally {
        if (!cancelled) setLoadingOpts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !clienteQ.trim()) return;
    const t = setTimeout(() => {
      void api<any[]>(`/contacts?q=${encodeURIComponent(clienteQ.trim())}`)
        .then((cRes) => {
          const list = (Array.isArray(cRes) ? cRes : []).map((c) => ({
            id: c.id,
            name: c.displayName || c.name || c.phone || 'Cliente',
            phone: c.phone || '',
            whatsapp_lid: c.whatsappLid ?? c.whatsapp_lid ?? null,
            profile_pic_url: c.profilePicUrl ?? c.profile_pic_url ?? null,
            notes: c.notes ?? null,
            wa_conversation_at: null,
            wa_archived: false,
            created_at: '',
            updated_at: '',
          })) as Contact[];
          setContacts(list);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [clienteQ, open]);

  const tituloValid = titulo.trim().length >= 5;
  const tituloInvalid = tituloTouched && !tituloValid;

  const scheduledAt = useMemo(() => {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [date, time]);

  const isPast = !!scheduledAt && scheduledAt.getTime() < Date.now();
  const dateValid = !!scheduledAt;

  const filteredContacts = useMemo(() => {
    const q = clienteQ.trim().toLowerCase();
    if (!q) return contacts.slice(0, 40);
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [contacts, clienteQ]);

  const selectedContact = contacts.find((c) => c.id === clienteId);

  const conversas = useMemo(() => {
    let list = tickets;
    if (clienteId) {
      list = list.filter((t) => t.contact_id === clienteId);
    }
    return list;
  }, [tickets, clienteId]);

  const canSubmit =
    tituloValid &&
    dateValid &&
    !!prioridade &&
    !!atribuidoId &&
    (!!conversaId || !!clienteId) &&
    !submitting;

  const roleLabel = (p: Profile) => {
    const r = String(p.apiRole ?? p.role).toUpperCase();
    if (r === 'ADMIN') return 'Administrador';
    if (r === 'SUPERVISOR') return 'Supervisor';
    return 'Atendente';
  };

  const conversaLabel = (t: ConversaOption) => {
    const proto = t.protocolo || t.id.slice(0, 8);
    return `Conversa #${proto} - ${t.contactName} (${t.agentName})`;
  };

  const handleSubmit = async () => {
    setTituloTouched(true);
    if (!canSubmit || !scheduledAt) return;
    setSubmitting(true);
    setError(null);
    try {
      const y = scheduledAt.getFullYear();
      const m = pad2(scheduledAt.getMonth() + 1);
      const d = pad2(scheduledAt.getDate());
      const h = pad2(scheduledAt.getHours());
      const min = pad2(scheduledAt.getMinutes());
      const data_agendada = `${y}-${m}-${d}T${h}:${min}:00`;

      await api('/mural/criar', {
        method: 'POST',
        body: JSON.stringify({
          titulo: titulo.trim(),
          cliente_id: clienteId || undefined,
          conversa_id: conversaId || undefined,
          atribuido_para_id:
            atribuidoId === MURAL_POOL ? 'mural' : atribuidoId,
          prioridade,
          data_agendada,
          nota_interna: notaInterna.trim() || undefined,
          notificar,
          repetir,
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar tarefa');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ background: '#0B0E14', borderColor: '#2A3245' }}
        role="dialog"
        aria-labelledby="criar-tarefa-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-[#2A3245] bg-[#0B0E14]">
          <div className="w-8" />
          <h2
            id="criar-tarefa-title"
            className="text-base font-semibold text-white text-center"
          >
            Criar Nova Tarefa
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 text-ink-300 hover:text-white"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loadingOpts && (
            <div className="flex items-center gap-2 text-xs text-ink-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Carregando clientes e conversas…
            </div>
          )}

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-200">
              Título da Tarefa <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                value={titulo}
                onChange={(e) => {
                  setTitulo(e.target.value);
                  setTituloTouched(true);
                }}
                onBlur={() => setTituloTouched(true)}
                placeholder="Ex: Retornar cliente sobre orçamento"
                className={`w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none border transition-colors ${
                  tituloInvalid
                    ? 'border-red-500'
                    : tituloValid
                      ? 'border-green-500'
                      : 'border-[#2A3245]'
                }`}
                style={{ background: '#151A27' }}
              />
              {tituloValid && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
              )}
            </div>
            {tituloInvalid && (
              <p className="text-xs text-red-400">
                O título deve ter pelo menos 5 caracteres
              </p>
            )}
          </div>

          {/* Cliente */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-200">Cliente</label>
            <div className="relative" ref={clienteBoxRef}>
              <div
                className="flex items-center gap-2 rounded-lg border border-[#2A3245] px-3 py-2"
                style={{ background: '#151A27' }}
              >
                <span className="text-[#25D366]">
                  <WhatsAppIcon />
                </span>
                <Search className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                <input
                  value={clienteOpen ? clienteQ : selectedContact?.name || clienteQ}
                  onChange={(e) => {
                    setClienteQ(e.target.value);
                    setClienteOpen(true);
                    if (clienteId) setClienteId('');
                  }}
                  onFocus={() => {
                    setClienteOpen(true);
                    setClienteQ(selectedContact?.name || '');
                  }}
                  placeholder="Buscar cliente…"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-ink-400"
                />
                {clienteId && (
                  <button
                    type="button"
                    className="text-ink-400 hover:text-white"
                    onClick={() => {
                      setClienteId('');
                      setClienteQ('');
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {clienteOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[#2A3245] bg-[#151A27] shadow-xl">
                  {filteredContacts.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-ink-400">Nenhum cliente</p>
                  ) : (
                    filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-ink-100 hover:bg-[#1c2333]"
                        onClick={() => {
                          setClienteId(c.id);
                          setClienteQ(c.name);
                          setClienteOpen(false);
                          setConversaId('');
                        }}
                      >
                        <span className="text-[#25D366]">
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate">{c.name}</span>
                        {c.phone && (
                          <span className="text-xs text-ink-400 ml-auto shrink-0">
                            {c.phone}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Conversa */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-200">
              Vincular Conversa
            </label>
            <select
              value={conversaId}
              onChange={(e) => {
                const id = e.target.value;
                setConversaId(id);
                const t = tickets.find((x) => x.id === id);
                if (t?.contact_id) {
                  setClienteId(t.contact_id);
                  setClienteQ(t.contactName || '');
                }
              }}
              className="w-full rounded-lg border border-[#2A3245] px-3 py-2.5 text-sm text-white outline-none"
              style={{ background: '#151A27' }}
            >
              <option value="">Selecione uma conversa…</option>
              {conversas.map((t) => (
                <option key={t.id} value={t.id}>
                  {conversaLabel(t)}
                </option>
              ))}
            </select>
          </div>

          {/* Atribuir */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-200">
              Atribuir para <span className="text-red-400">*</span>
            </label>
            <select
              value={atribuidoId}
              onChange={(e) => setAtribuidoId(e.target.value)}
              className="w-full rounded-lg border border-[#2A3245] px-3 py-2.5 text-sm text-white outline-none"
              style={{ background: '#151A27' }}
            >
              <option value={MURAL_POOL}>
                Deixar no Mural (qualquer um pode aceitar)
              </option>
              {users
                .filter((u) => u.is_active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} • {roleLabel(u)}
                  </option>
                ))}
            </select>
          </div>

          {/* Prioridade */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-200">
              Prioridade <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => {
                const active = prioridade === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPrioridade(p.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      active ? p.active : p.idle
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data / Hora */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-200">
              Data e Hora Agendada <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-[#2A3245] px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: '#151A27', colorScheme: 'dark' }}
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-lg border border-[#2A3245] px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: '#151A27', colorScheme: 'dark' }}
              />
            </div>
            {isPast && (
              <p className="text-xs text-amber-400">
                Será marcada como Atrasada
              </p>
            )}
          </div>

          {/* Nota */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink-200">
              Nota Interna
            </label>
            <textarea
              value={notaInterna}
              onChange={(e) => setNotaInterna(e.target.value)}
              rows={3}
              placeholder="Detalhes que aparecem no preview do card..."
              className="w-full rounded-lg border border-[#2A3245] px-3 py-2.5 text-sm text-white outline-none resize-none placeholder:text-ink-400"
              style={{ background: '#151A27' }}
            />
          </div>

          <div className="space-y-3 pt-1">
            <Toggle
              checked={notificar}
              onChange={setNotificar}
              label="Notificar agente"
            />
            <Toggle
              checked={repetir}
              onChange={setRepetir}
              label="Repetir tarefa"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-[#2A3245] bg-[#0B0E14]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-200 border border-[#2A3245] hover:bg-[#151A27] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar Tarefa
          </button>
        </div>
      </div>
    </div>
  );
}
