import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  FilePenLine,
  Info,
  Lock,
} from 'lucide-react';
import type { Profile } from '../../types';
import { ContactAvatar } from '../ContactAvatar';

const MAX_OBS = 500;
const MIN_OBS = 5;

const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const notaInternaSchema = z
  .object({
    texto: z
      .string()
      .max(MAX_OBS, `Máximo ${MAX_OBS} caracteres`)
      .refine((v) => v.trim().length >= MIN_OBS, {
        message: 'Mínimo 5 caracteres para criar tarefa',
      }),
    criar_tarefa: z.boolean(),
    data_lembrete: z.string(),
    responsavel_id: z.string(),
    prioridade: prioritySchema,
  })
  .superRefine((data, ctx) => {
    if (!data.criar_tarefa) return;
    if (!data.data_lembrete.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Data do lembrete obrigatória',
        path: ['data_lembrete'],
      });
    }
    if (!data.responsavel_id.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Responsável obrigatório',
        path: ['responsavel_id'],
      });
    }
  });

export type NotaInternaFormValues = z.infer<typeof notaInternaSchema>;

export type NotaInternaSavePayload = {
  text: string;
  postToMural: boolean;
  dueAt: string;
  assignedToId: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
};

type PriorityValue = NotaInternaFormValues['prioridade'];

const PRIORITIES: {
  value: PriorityValue;
  label: string;
  idle: string;
  active: string;
  dot: string;
}[] = [
  {
    value: 'LOW',
    label: 'Baixa',
    idle: 'bg-blue-900/50 text-blue-400 border-blue-800',
    active: 'bg-blue-900/50 text-blue-400 border-blue-400',
    dot: 'bg-blue-400',
  },
  {
    value: 'MEDIUM',
    label: 'Média',
    idle: 'bg-amber-900/40 text-amber-300 border-amber-800',
    active: 'bg-amber-400 text-black border-amber-300',
    dot: 'bg-black',
  },
  {
    value: 'HIGH',
    label: 'Alta',
    idle: 'bg-orange-900/50 text-orange-400 border-orange-800',
    active: 'bg-orange-900/50 text-orange-400 border-orange-400',
    dot: 'bg-orange-400',
  },
  {
    value: 'URGENT',
    label: 'Urgente',
    idle: 'bg-red-900/50 text-red-400 border-red-800',
    active: 'bg-red-900/50 text-red-400 border-red-400',
    dot: 'bg-red-400',
  },
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DDTHH:mm` for datetime-local */
function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatReminderLabel(value: string): string {
  if (!value) return 'Selecionar data e hora';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Selecionar data e hora';

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.toDateString() === today.toDateString()) return `Hoje • ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Amanhã • ${time}`;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} • ${time}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function defaultDueAtPlusHours(hours: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + hours * 60, 0, 0);
  return toLocalInputValue(d);
}

function defaultDueAtPlusMinutes(minutes: number) {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + minutes);
  return toLocalInputValue(d);
}

function tomorrowAtNine() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInputValue(d);
}

interface NotaInternaFormProps {
  onSave: (payload: NotaInternaSavePayload) => void | Promise<void>;
  onCancel: () => void;
  profiles: Profile[];
  currentUserId?: string;
  /** Popover flutuante: sem card próprio (o wrapper define bg/borda). */
  variant?: 'card' | 'popover';
  className?: string;
}

export function NotaInternaForm({
  onSave,
  onCancel,
  profiles,
  currentUserId,
  variant = 'card',
  className = '',
}: NotaInternaFormProps) {
  const agents = useMemo(
    () => profiles.filter((p) => p.is_active),
    [profiles],
  );
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isValid },
  } = useForm<NotaInternaFormValues>({
    resolver: zodResolver(notaInternaSchema),
    mode: 'onChange',
    defaultValues: {
      texto: '',
      criar_tarefa: true,
      data_lembrete: defaultDueAtPlusHours(1),
      responsavel_id: currentUserId ?? agents[0]?.id ?? '',
      prioridade: 'MEDIUM',
    },
  });

  const texto = useWatch({ control, name: 'texto' }) ?? '';
  const criarTarefa = useWatch({ control, name: 'criar_tarefa' }) ?? true;
  const dataLembrete = useWatch({ control, name: 'data_lembrete' }) ?? '';
  const responsavelId = useWatch({ control, name: 'responsavel_id' }) ?? '';
  const prioridade = useWatch({ control, name: 'prioridade' }) ?? 'MEDIUM';

  const textoLen = texto.length;
  const textoTrimLen = texto.trim().length;
  const textoTouched = textoLen > 0;
  const textoOk = textoTrimLen >= MIN_OBS;
  const textoBorder =
    !textoTouched
      ? 'border-[#44403B]'
      : textoOk
        ? 'border-green-500'
        : 'border-red-500';

  const dueDate = dataLembrete ? new Date(dataLembrete) : null;
  const dueInPast =
    !!dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
  const dueMissing = criarTarefa && !dataLembrete.trim();
  const assigneeMissing = criarTarefa && !responsavelId.trim();

  const selectedAgent =
    agents.find((a) => a.id === responsavelId) ??
    agents.find((a) => a.id === currentUserId) ??
    agents[0];

  const canSubmit =
    textoOk &&
    (!criarTarefa || (!!dataLembrete.trim() && !!responsavelId.trim()));

  const muralFieldsInvalid =
    criarTarefa && textoOk && (dueMissing || assigneeMissing);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!assigneeRef.current?.contains(e.target as Node)) {
        setAssigneeOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        text: values.texto.trim(),
        postToMural: values.criar_tarefa,
        dueAt: values.data_lembrete,
        assignedToId: values.responsavel_id || currentUserId || '',
        priority: values.prioridade,
      });
    } finally {
      setSaving(false);
    }
  });

  const isPopover = variant === 'popover';
  const fieldBg = isPopover ? 'bg-[#0F172A]' : 'bg-[#0C0A09]';
  const fieldBorder = isPopover ? 'border-[#1E293B]' : 'border-[#44403B]';
  const panelBg = isPopover ? 'bg-[#1E293B]/60' : 'bg-[#292524]';
  const panelBorder = isPopover ? 'border-[#1E293B]' : 'border-[#44403B]';

  return (
    <form
      onSubmit={onSubmit}
      onClick={(e) => e.stopPropagation()}
      className={
        isPopover
          ? `flex max-h-[360px] flex-col gap-3 overflow-hidden ${className}`
          : `mb-2 flex max-h-[380px] flex-col gap-3 overflow-hidden rounded-lg border border-[#44403B] bg-[#1C1917] p-3 ${className}`
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-400 text-stone-900">
            <FilePenLine className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold leading-tight text-amber-300">
                Nota Interna
              </h3>
              <span className="inline-flex rounded-full border border-amber-700/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200/90">
                não enviado ao cliente
              </span>
            </div>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium text-amber-200 ${panelBorder} ${panelBg}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Rascunho
        </span>
      </div>

      {/* Observação */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-200">
          Observação interna <span className="text-amber-400">*</span>
        </label>
        <Controller
          name="texto"
          control={control}
          render={({ field }) => (
            <textarea
              {...field}
              autoFocus
              rows={2}
              maxLength={MAX_OBS}
              placeholder="Digite uma observação interna..."
              className={`min-h-[60px] max-h-[80px] w-full resize-none rounded-lg border ${fieldBg} px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:ring-1 focus:ring-sky-500/40 ${textoBorder}`}
            />
          )}
        />
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="min-h-[1rem] text-[11px]">
            {textoTouched && !textoOk && (
              <span className="text-red-400">
                {errors.texto?.message ?? 'Mínimo 5 caracteres para criar tarefa'}
              </span>
            )}
            {textoOk && (
              <span className="inline-flex items-center gap-1 text-green-400">
                <Check className="h-3 w-3" />
                Pronto
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 tabular-nums">
            {textoLen}/{MAX_OBS}
          </span>
        </div>
      </div>

      {/* Toggle mural */}
      <div className={`flex items-center gap-2 rounded-xl border p-2 ${panelBorder} ${panelBg}`}>
        <Controller
          name="criar_tarefa"
          control={control}
          render={({ field }) => (
            <button
              type="button"
              role="switch"
              aria-checked={field.value}
              aria-label="Criar tarefa no Mural"
              onClick={() => field.onChange(!field.value)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                field.value ? 'bg-amber-300' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  field.value ? 'left-[1.375rem]' : 'left-0.5'
                }`}
              />
            </button>
          )}
        />
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-100">Criar tarefa no Mural</p>
          <p className="mt-0.5 hidden text-[11px] leading-snug text-slate-400 sm:block">
            Ao ativar, esta nota será criada como tarefa no mural e atribuída ao
            responsável.
          </p>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {criarTarefa && (
          <motion.div
            key="tarefa-fields"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3">
              {/* Data + Responsável */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-200">
                    Data do lembrete <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        const el = dateInputRef.current;
                        if (!el) return;
                        if (typeof el.showPicker === 'function') {
                          el.showPicker();
                        } else {
                          el.focus();
                          el.click();
                        }
                      }}
                      className={`flex h-8 w-full items-center justify-between rounded-lg border ${fieldBg} px-2 text-left text-xs transition-colors ${
                        dueMissing
                          ? 'border-red-500 text-slate-300'
                          : `${fieldBorder} text-slate-100 hover:border-sky-500/50`
                      }`}
                    >
                      <span className="truncate">
                        {formatReminderLabel(dataLembrete)}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </button>
                    <Controller
                      name="data_lembrete"
                      control={control}
                      render={({ field: { ref, ...field } }) => (
                        <input
                          {...field}
                          ref={(el) => {
                            ref(el);
                            (
                              dateInputRef as MutableRefObject<HTMLInputElement | null>
                            ).current = el;
                          }}
                          type="datetime-local"
                          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                          tabIndex={-1}
                        />
                      )}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <ShortcutChip
                      label="+1 min"
                      onClick={() =>
                        setValue('data_lembrete', defaultDueAtPlusMinutes(1), {
                          shouldValidate: true,
                        })
                      }
                    />
                    <ShortcutChip
                      label="+1h"
                      onClick={() =>
                        setValue('data_lembrete', defaultDueAtPlusHours(1), {
                          shouldValidate: true,
                        })
                      }
                    />
                    <ShortcutChip
                      label="+3h"
                      onClick={() =>
                        setValue('data_lembrete', defaultDueAtPlusHours(3), {
                          shouldValidate: true,
                        })
                      }
                    />
                    <ShortcutChip
                      label="Amanhã 09:00"
                      onClick={() =>
                        setValue('data_lembrete', tomorrowAtNine(), {
                          shouldValidate: true,
                        })
                      }
                    />
                  </div>
                  {dueMissing && (
                    <p className="mt-0.5 text-[10px] text-red-400">
                      Informe a data
                    </p>
                  )}
                  {!dueMissing && dueInPast && (
                    <p className="mt-0.5 text-[10px] text-amber-400">
                      Data no passado será marcada como Atrasada
                    </p>
                  )}
                </div>

                <div ref={assigneeRef} className="relative">
                  <label className="mb-1 block text-xs font-medium text-slate-200">
                    Responsável <span className="text-amber-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setAssigneeOpen((o) => !o)}
                    className={`flex h-8 w-full items-center gap-1.5 rounded-lg border ${fieldBg} px-2 text-left text-xs transition-colors ${
                      assigneeMissing
                        ? 'border-red-500'
                        : `${fieldBorder} hover:border-sky-500/50`
                    }`}
                  >
                    {selectedAgent ? (
                      <>
                        <AgentAvatar profile={selectedAgent} />
                        <span className="min-w-0 flex-1 truncate text-slate-100">
                          {selectedAgent.name}
                        </span>
                      </>
                    ) : (
                      <span className="flex-1 text-slate-500">Selecione</span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                  {assigneeOpen && (
                    <div
                      className={`absolute left-0 right-0 z-20 mt-1 max-h-32 overflow-y-auto rounded-lg border py-1 shadow-lg ${fieldBorder} ${fieldBg}`}
                    >
                      {agents.map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => {
                            setValue('responsavel_id', agent.id, {
                              shouldValidate: true,
                            });
                            setAssigneeOpen(false);
                          }}
                          className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-[#1E293B] ${
                            agent.id === responsavelId
                              ? 'bg-sky-500/10 text-sky-100'
                              : 'text-slate-200'
                          }`}
                        >
                          <AgentAvatar profile={agent} />
                          <span className="truncate">{agent.name}</span>
                        </button>
                      ))}
                      {agents.length === 0 && (
                        <p className="px-2 py-1.5 text-[10px] text-slate-500">
                          Nenhum usuário disponível
                        </p>
                      )}
                    </div>
                  )}
                  {assigneeMissing && (
                    <p className="mt-0.5 text-[10px] text-red-400">
                      Selecione o responsável
                    </p>
                  )}
                </div>
              </div>

              {/* Prioridade */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-200">
                  Prioridade
                </label>
                <div className="flex flex-row flex-wrap gap-2">
                  {PRIORITIES.map((p) => {
                    const selected = prioridade === p.value;
                    const dotClass =
                      selected && p.value === 'MEDIUM' ? 'bg-black' : p.dot;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() =>
                          setValue('prioridade', p.value, { shouldValidate: true })
                        }
                        className={`inline-flex h-8 w-auto items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                          selected
                            ? `${p.active} border-2 scale-[1.02]`
                            : `${p.idle} border`
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {muralFieldsInvalid && (
            <p className="inline-flex items-center gap-1 text-[10px] leading-snug text-slate-400">
              <Info className="h-3 w-3 shrink-0 text-slate-500" />
              <span className="truncate">
                Preencha a data e o responsável para salvar como tarefa
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className={`h-8 rounded-lg px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white ${
              isPopover ? 'hover:bg-[#1E293B]' : 'hover:bg-[#292524]'
            }`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit || saving || !isValid}
            title={
              !textoOk
                ? 'Mínimo 5 caracteres para criar tarefa'
                : muralFieldsInvalid
                  ? 'Preencha a data e o responsável'
                  : undefined
            }
            className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition-colors ${
              canSubmit && isValid && !saving
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-600 text-slate-300'
            }`}
          >
            {(!canSubmit || !isValid) && <Lock className="h-3 w-3" />}
            {criarTarefa ? 'Salvar no Mural' : 'Salvar Nota'}
          </button>
        </div>
      </div>
    </form>
  );
}

function ShortcutChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[#1E293B] bg-[#1E293B]/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 transition-colors hover:border-sky-500/50 hover:text-sky-100"
    >
      {label}
    </button>
  );
}

function AgentAvatar({ profile }: { profile: Profile }) {
  if (profile.avatar_url) {
    return (
      <ContactAvatar
        name={profile.name}
        profilePicUrl={profile.avatar_url}
        size="sm"
        className="!h-5 !w-5 !text-[9px]"
      />
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
      {initials(profile.name)}
    </span>
  );
}
