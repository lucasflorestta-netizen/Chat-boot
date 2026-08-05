import { useState, useEffect, useMemo } from 'react';
import { useAutoMessageSettings, useSectors } from '../../hooks/useData';
import { api } from '../../lib/api';
import { mapAutoSettings } from '../../lib/mappers';
import type { AutoMessageSettings } from '../../types';
import {
  Save,
  Loader2,
  MessageSquare,
  Bot,
  UserCheck,
  CheckCircle,
  Star,
  Power,
  Check,
  AlertCircle,
  Moon,
  Clock,
  Hash,
  Users,
  UtensilsCrossed,
} from 'lucide-react';

/** Same rule as API: lines like `1 - Suporte` are sector options. */
const MENU_OPTION_LINE = /^\d+\s*[-–.]\s*.+$/;
const DEFAULT_MENU_INTRO = 'Digite o número do setor:';

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

/** Weekdays only — Sat/Sun use dedicated sections below. */
const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
];

function extractMenuIntro(message: string): string {
  const introLines = (message ?? '')
    .split('\n')
    .filter((line) => !MENU_OPTION_LINE.test(line.trim()));
  return introLines.join('\n').trimEnd() || DEFAULT_MENU_INTRO;
}

function buildBotMenuMessage(
  intro: string,
  sectors: Array<{ triageOption?: number; name: string }>,
): string {
  const safeIntro = intro.trimEnd() || DEFAULT_MENU_INTRO;
  const sorted = [...sectors].sort(
    (a, b) => (a.triageOption ?? 0) - (b.triageOption ?? 0),
  );
  const optionLines = sorted.map(
    (s) => `${s.triageOption ?? '?'} - ${s.name}`,
  );
  return optionLines.length
    ? `${safeIntro}\n${optionLines.join('\n')}`
    : safeIntro;
}

function buildBusinessDays(form: AutoMessageSettings): number[] {
  const weekdays = (form.business_days ?? []).filter((d) => d >= 1 && d <= 5);
  const days = [...weekdays];
  if (form.saturday_hours_enabled && !days.includes(6)) days.push(6);
  if (form.sunday_hours_enabled && !days.includes(7)) days.push(7);
  return days.sort((a, b) => a - b);
}

function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] text-ink-200">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input !py-1 text-xs h-8"
      >
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-success-500' : 'bg-ink-600'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function AutoMessagesView() {
  const { settings, loading, refetch } = useAutoMessageSettings();
  const { sectors, loading: sectorsLoading } = useSectors();
  const [form, setForm] = useState<AutoMessageSettings | null>(settings);
  const [menuIntro, setMenuIntro] = useState(DEFAULT_MENU_INTRO);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setForm(settings);
    if (settings?.bot_menu_message != null) {
      setMenuIntro(extractMenuIntro(settings.bot_menu_message));
    }
  }, [settings]);

  const sectorOptionLines = useMemo(
    () =>
      [...sectors]
        .sort((a, b) => (a.triageOption ?? 0) - (b.triageOption ?? 0))
        .map((s) => `${s.triageOption ?? '?'} - ${s.name}`),
    [sectors],
  );

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const toggleDay = (day: number) => {
    if (!form) return;
    const days = (form.business_days ?? []).filter((d) => d >= 1 && d <= 5);
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
    setForm({ ...form, business_days: next });
  };

  const handleSave = async () => {
    if (!form) return;

    const warnMin = Number(form.inactivity_warning_minutes);
    const closeMin = Number(form.inactivity_closing_minutes);
    if (!Number.isInteger(warnMin) || warnMin < 1) {
      setFeedback({
        type: 'error',
        message: 'O tempo do aviso de inatividade deve ser um número inteiro maior que zero.',
      });
      return;
    }
    if (!Number.isInteger(closeMin) || closeMin < 1) {
      setFeedback({
        type: 'error',
        message: 'O tempo de encerramento por inatividade deve ser um número inteiro maior que zero.',
      });
      return;
    }
    if (closeMin <= warnMin) {
      setFeedback({
        type: 'error',
        message: 'O encerramento por inatividade deve ocorrer depois do aviso.',
      });
      return;
    }

    if (form.business_hours_end <= form.business_hours_start) {
      setFeedback({
        type: 'error',
        message: 'O fim do expediente (dias úteis) deve ser depois do início.',
      });
      return;
    }

    if (
      form.saturday_hours_enabled &&
      form.saturday_hours_end <= form.saturday_hours_start
    ) {
      setFeedback({
        type: 'error',
        message: 'O fim do expediente de sábado deve ser depois do início.',
      });
      return;
    }

    if (
      form.sunday_hours_enabled &&
      form.sunday_hours_end <= form.sunday_hours_start
    ) {
      setFeedback({
        type: 'error',
        message: 'O fim do expediente de domingo deve ser depois do início.',
      });
      return;
    }

    const businessDays = buildBusinessDays(form);
    const hasWeekday = businessDays.some((d) => d >= 1 && d <= 5);
    if (!hasWeekday && !form.saturday_hours_enabled && !form.sunday_hours_enabled) {
      setFeedback({
        type: 'error',
        message: 'Selecione pelo menos um dia de funcionamento.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const botMenuMessage = buildBotMenuMessage(menuIntro, sectors);
      const data = await api<any>('/auto-message-settings', {
        method: 'PUT',
        body: JSON.stringify({
          greetingMessage: form.greeting_message,
          protocolName: form.protocol_name,
          botMenuActive: form.bot_menu_active,
          botMenuMessage,
          takeoverMessage: form.takeover_message,
          closingMessage: form.closing_message,
          npsQuestion: form.nps_question,
          npsActive: form.nps_active,
          afterHoursMessage: form.after_hours_message,
          agentsBusyMessage: form.agents_busy_message,
          inactivityEnabled: form.inactivity_enabled,
          inactivityWarningMessage: form.inactivity_warning_message,
          inactivityWarningMinutes: warnMin,
          inactivityClosingMessage: form.inactivity_closing_message,
          inactivityClosingMinutes: closeMin,
          satisfactionFormUrl: form.satisfaction_form_url?.trim() ?? '',
          businessHoursEnabled: form.business_hours_enabled,
          businessHoursStart: form.business_hours_start,
          businessHoursEnd: form.business_hours_end,
          businessDays,
          saturdayHoursEnabled: form.saturday_hours_enabled,
          saturdayHoursStart: form.saturday_hours_start,
          saturdayHoursEnd: form.saturday_hours_end,
          sundayHoursEnabled: form.sunday_hours_enabled,
          sundayHoursStart: form.sunday_hours_start,
          sundayHoursEnd: form.sunday_hours_end,
          operatorLunchAutoStatus: form.operator_lunch_auto_status,
        }),
      });
      if (data) {
        const mapped = mapAutoSettings(data);
        setForm(mapped);
        setMenuIntro(extractMenuIntro(mapped.bot_menu_message));
      }
      setFeedback({ type: 'success', message: 'Configurações salvas com sucesso.' });
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar configurações.';
      setFeedback({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white leading-tight">Mensagens Automáticas</h2>
          <p className="text-xs text-ink-300">
            Textos de automação, horário comercial e offline no almoço
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="card flex items-center gap-2 px-2.5 py-1.5">
            <Power className={`w-4 h-4 ${form.bot_menu_active ? 'text-success-500' : 'text-ink-300'}`} />
            <span className="text-xs text-ink-200 whitespace-nowrap">Menu Bot</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.bot_menu_active}
              onClick={() => setForm({ ...form, bot_menu_active: !form.bot_menu_active })}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${form.bot_menu_active ? 'bg-success-500' : 'bg-ink-600'}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  form.bot_menu_active ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary shrink-0 !px-3 !py-1.5 text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Configurações
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-2 flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
            feedback.type === 'success'
              ? 'bg-success-500/15 text-success-400'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        <div className="grid grid-cols-3 gap-3 content-start">
          {/* Linha 1 */}
          <SettingCard
            icon={<MessageSquare className="w-4 h-4" />}
            title="Mensagem de Saudação (Boas-vindas)"
          >
            <textarea
              value={form.greeting_message}
              onChange={(e) => setForm({ ...form, greeting_message: e.target.value })}
              className="input h-10 resize-none !py-1.5 text-xs"
            />
            <p className="mt-1 text-[10px] text-ink-300 leading-tight">
              Use {'{{protocolName}}'} e {'{{protocol}}'}.
            </p>
          </SettingCard>

          <SettingCard
            icon={<Bot className="w-4 h-4" />}
            title="Mensagem de Menu de Opções"
          >
            <textarea
              value={menuIntro}
              onChange={(e) => setMenuIntro(e.target.value)}
              className="input h-8 resize-none !py-1 text-xs"
              placeholder={DEFAULT_MENU_INTRO}
            />
            <div className="mt-1.5 rounded-md border border-ink-600 bg-ink-900/60 px-2 py-1 space-y-0.5 max-h-[4.5rem] overflow-hidden">
              {sectorsLoading ? (
                <p className="text-[10px] text-ink-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Carregando…
                </p>
              ) : sectorOptionLines.length === 0 ? (
                <p className="text-[10px] text-ink-400">Nenhum setor cadastrado.</p>
              ) : (
                sectorOptionLines.map((line) => (
                  <p key={line} className="text-[11px] text-white font-mono tabular-nums leading-tight">
                    {line}
                  </p>
                ))
              )}
            </div>
          </SettingCard>

          <SettingCard
            icon={<UserCheck className="w-4 h-4" />}
            title="Mensagem ao Assumir Atendimento"
          >
            <textarea
              value={form.takeover_message}
              onChange={(e) => setForm({ ...form, takeover_message: e.target.value })}
              className="input h-10 resize-none !py-1.5 text-xs"
              placeholder="Conversa assumida pelo {{agente}}"
            />
          </SettingCard>

          {/* Linha 2 */}
          <SettingCard
            icon={<CheckCircle className="w-4 h-4" />}
            title="Mensagem de Finalização"
          >
            <textarea
              value={form.closing_message}
              onChange={(e) => setForm({ ...form, closing_message: e.target.value })}
              className="input h-10 resize-none !py-1.5 text-xs"
            />
          </SettingCard>

          <SettingCard
            icon={<Moon className="w-4 h-4" />}
            title="Mensagem de Fim de Expediente"
          >
            <textarea
              value={form.after_hours_message}
              onChange={(e) => setForm({ ...form, after_hours_message: e.target.value })}
              className="input h-10 resize-none !py-1.5 text-xs"
              placeholder="No momento estamos fora do horário de atendimento. Retornaremos assim que possível."
            />
          </SettingCard>

          <SettingCard
            icon={<Users className="w-4 h-4" />}
            title="Mensagem de fila (agentes ocupados)"
          >
            <textarea
              value={form.agents_busy_message}
              onChange={(e) => setForm({ ...form, agents_busy_message: e.target.value })}
              className="input h-10 resize-none !py-1.5 text-xs"
              placeholder="Todos os nossos atendentes estão ocupados no momento. Você é o {{posicao}}º da fila. Em breve você será atendido."
            />
            <p className="mt-1 text-[10px] text-ink-300 leading-tight">
              Use {'{{posicao}}'} (posição na fila do setor). Também {'{{protocol}}'} /{' '}
              {'{{protocolName}}'}. Vazio = desligado.
            </p>
          </SettingCard>

          {/* Linha 3 — Protocolo + NPS + Offline */}
          <SettingCard
            icon={<Hash className="w-4 h-4" />}
            title="Barra de Protocolo"
          >
            <input
              type="text"
              value={form.protocol_name}
              onChange={(e) => setForm({ ...form, protocol_name: e.target.value })}
              className="input !py-1.5 text-xs h-8"
              placeholder="protocolo de atendimento"
            />
            <p className="mt-1 text-[10px] text-ink-300 leading-tight">
              Número em {'{{protocol}}'}.
            </p>
          </SettingCard>

          <SettingCard
            icon={<Star className="w-4 h-4" />}
            title="Pesquisa de Satisfação (NPS)"
            compact
            headerRight={
              <ToggleSwitch
                checked={form.nps_active}
                onChange={() => setForm({ ...form, nps_active: !form.nps_active })}
                ariaLabel="Pesquisa de Satisfação"
              />
            }
          >
            <textarea
              value={form.nps_question}
              onChange={(e) => setForm({ ...form, nps_question: e.target.value })}
              className="input h-8 resize-none !py-1 text-xs"
            />
          </SettingCard>

          <SettingCard
            icon={<UtensilsCrossed className="w-4 h-4" />}
            title="Offline automático (almoço e fim de expediente)"
            compact
            headerRight={
              <ToggleSwitch
                checked={form.operator_lunch_auto_status}
                onChange={() =>
                  setForm({
                    ...form,
                    operator_lunch_auto_status: !form.operator_lunch_auto_status,
                  })
                }
                ariaLabel="Offline automático"
              />
            }
          >
            <p className="text-[10px] text-ink-300 leading-tight">
              Só com o agente logado: 5 min antes do almoço fica offline; no horário exato do
              fim do expediente (workEnd) também. Ao terminar o almoço ou no início do
              expediente, a tela pede confirmação — só então volta a Disponível e recebe
              fila. Atendimentos já atribuídos permanecem.
            </p>
          </SettingCard>

          {/* Linha 4 — Inatividade (1 coluna) */}
          <SettingCard
            icon={<Clock className="w-4 h-4" />}
            title="Inatividade no cliente"
            compact
            headerRight={
              <ToggleSwitch
                checked={form.inactivity_enabled}
                onChange={() =>
                  setForm({ ...form, inactivity_enabled: !form.inactivity_enabled })
                }
                ariaLabel="Inatividade no cliente"
              />
            }
          >
            <div
              className={`space-y-1.5 ${
                form.inactivity_enabled ? '' : 'pointer-events-none opacity-50'
              }`}
            >
              <div>
                <label className="mb-0.5 block text-[11px] text-ink-200">Mensagem de aviso</label>
                <textarea
                  value={form.inactivity_warning_message}
                  onChange={(e) =>
                    setForm({ ...form, inactivity_warning_message: e.target.value })
                  }
                  className="input h-8 resize-none !py-1 text-xs"
                  disabled={!form.inactivity_enabled}
                  placeholder="Ainda está aí? Não tivemos retorno, em breve o atendimento será encerrado."
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] text-ink-200">Mensagem de encerramento</label>
                <textarea
                  value={form.inactivity_closing_message}
                  onChange={(e) =>
                    setForm({ ...form, inactivity_closing_message: e.target.value })
                  }
                  className="input h-8 resize-none !py-1 text-xs"
                  disabled={!form.inactivity_enabled}
                  placeholder="Encerramos seu atendimento por inatividade. Obrigado!"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[11px] text-ink-200">Aviso (min)</label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.inactivity_warning_minutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        inactivity_warning_minutes: Number(e.target.value),
                      })
                    }
                    className="input !py-1 text-xs h-8"
                    disabled={!form.inactivity_enabled}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] text-ink-200">Encerrar (min)</label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.inactivity_closing_minutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        inactivity_closing_minutes: Number(e.target.value),
                      })
                    }
                    className="input !py-1 text-xs h-8"
                    disabled={!form.inactivity_enabled}
                  />
                </div>
              </div>
            </div>
          </SettingCard>

          {/* Linha 4 — Horário comercial (1 coluna) */}
          <SettingCard
            icon={<Clock className="w-4 h-4" />}
            title="Horário comercial"
            compact
            headerRight={
              <ToggleSwitch
                checked={form.business_hours_enabled}
                onChange={() =>
                  setForm({
                    ...form,
                    business_hours_enabled: !form.business_hours_enabled,
                  })
                }
                ariaLabel="Ativar horário comercial"
              />
            }
          >
            <p className="mb-1.5 text-[10px] text-ink-300 leading-tight">
              Brasília. Fora do expediente envia Fim de Expediente.
            </p>

            {form.business_hours_enabled && (
              <div className="space-y-1.5">
                <div>
                  <label className="mb-0.5 block text-[11px] text-ink-200">Dias úteis</label>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {WEEKDAY_OPTIONS.map(({ value, label }) => {
                      const active = (form.business_days ?? []).includes(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => toggleDay(value)}
                          aria-pressed={active}
                          className={`min-w-[2rem] rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            active
                              ? 'bg-brand-500 text-white'
                              : 'bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <TimeSelect
                    label="Início"
                    value={form.business_hours_start}
                    onChange={(business_hours_start) =>
                      setForm({ ...form, business_hours_start })
                    }
                  />
                  <TimeSelect
                    label="Fim"
                    value={form.business_hours_end}
                    onChange={(business_hours_end) =>
                      setForm({ ...form, business_hours_end })
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        business_hours_start: '08:00',
                        business_hours_end: '18:00',
                      })
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
                  >
                    08h–18h
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        business_hours_start: '09:00',
                        business_hours_end: '18:00',
                      })
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
                  >
                    09h–18h
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        business_hours_start: '08:00',
                        business_hours_end: '17:00',
                      })
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
                  >
                    08h–17h
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        business_days: [1, 2, 3, 4, 5],
                      })
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
                  >
                    Seg–Sex
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="space-y-1.5 rounded-md border border-ink-700/80 bg-ink-800/40 p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white">Sábado</p>
                      <ToggleSwitch
                        checked={form.saturday_hours_enabled}
                        onChange={() =>
                          setForm({
                            ...form,
                            saturday_hours_enabled: !form.saturday_hours_enabled,
                          })
                        }
                        ariaLabel="Atender no sábado"
                      />
                    </div>
                    {form.saturday_hours_enabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <TimeSelect
                          label="Início"
                          value={form.saturday_hours_start}
                          onChange={(saturday_hours_start) =>
                            setForm({ ...form, saturday_hours_start })
                          }
                        />
                        <TimeSelect
                          label="Fim"
                          value={form.saturday_hours_end}
                          onChange={(saturday_hours_end) =>
                            setForm({ ...form, saturday_hours_end })
                          }
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 rounded-md border border-ink-700/80 bg-ink-800/40 p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white">Domingo</p>
                      <ToggleSwitch
                        checked={form.sunday_hours_enabled}
                        onChange={() =>
                          setForm({
                            ...form,
                            sunday_hours_enabled: !form.sunday_hours_enabled,
                          })
                        }
                        ariaLabel="Atender no domingo"
                      />
                    </div>
                    {form.sunday_hours_enabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <TimeSelect
                          label="Início"
                          value={form.sunday_hours_start}
                          onChange={(sunday_hours_start) =>
                            setForm({ ...form, sunday_hours_start })
                          }
                        />
                        <TimeSelect
                          label="Fim"
                          value={form.sunday_hours_end}
                          onChange={(sunday_hours_end) =>
                            setForm({ ...form, sunday_hours_end })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SettingCard>
        </div>
      </div>
    </div>
  );
}

function SettingCard({
  icon,
  title,
  children,
  className = '',
  headerRight,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`card flex flex-col ${compact ? 'p-2' : 'p-2.5'} ${className}`}>
      <div className={`flex items-center gap-2 ${compact ? 'mb-1.5' : 'mb-2'}`}>
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-brand-400">
          {icon}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white leading-tight">{title}</p>
        {headerRight}
      </div>
      <div className="min-h-0">{children}</div>
    </div>
  );
}
