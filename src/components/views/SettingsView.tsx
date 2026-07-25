import { useState, useEffect } from 'react';
import { useAutoMessageSettings } from '../../hooks/useData';
import { api } from '../../lib/api';
import { mapAutoSettings } from '../../lib/mappers';
import type { AutoMessageSettings } from '../../types';
import { Save, Loader2, Clock, Check, AlertCircle, UtensilsCrossed } from 'lucide-react';

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

/** ISO weekdays 1=Mon … 7=Sun */
const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

export function SettingsView() {
  const { settings, loading, refetch } = useAutoMessageSettings();
  const [form, setForm] = useState<AutoMessageSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const toggleDay = (day: number) => {
    if (!form) return;
    const days = form.business_days ?? [];
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
    setForm({ ...form, business_days: next });
  };

  const handleSave = async () => {
    if (!form) return;

    if (form.business_hours_end <= form.business_hours_start) {
      setFeedback({
        type: 'error',
        message: 'O fim do expediente deve ser depois do início.',
      });
      return;
    }

    if (!form.business_days?.length) {
      setFeedback({
        type: 'error',
        message: 'Selecione pelo menos um dia de funcionamento.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const data = await api<any>('/auto-message-settings', {
        method: 'PUT',
        body: JSON.stringify({
          businessHoursEnabled: form.business_hours_enabled,
          businessHoursStart: form.business_hours_start,
          businessHoursEnd: form.business_hours_end,
          businessDays: form.business_days,
          operatorLunchAutoStatus: form.operator_lunch_auto_status,
        }),
      });
      if (data) setForm(mapAutoSettings(data));
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Configurações</h2>
            <p className="text-sm text-ink-300">Horário de funcionamento da empresa</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary shrink-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'bg-success-500/15 text-success-400'
                : 'bg-red-500/15 text-red-400'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {feedback.message}
          </div>
        )}

        <div className="card p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  form.operator_lunch_auto_status ? 'bg-success-500/20' : 'bg-ink-700'
                }`}
              >
                <UtensilsCrossed
                  className={`w-5 h-5 ${
                    form.operator_lunch_auto_status ? 'text-success-500' : 'text-ink-300'
                  }`}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  Offline automático (almoço e fim de expediente)
                </p>
                <p className="text-xs text-ink-300">
                  Só com o agente logado: 5 min antes do almoço fica offline; no horário
                  exato do fim do expediente (workEnd) também. Volta a Disponível ao
                  terminar o almoço ou no início do próximo expediente se ainda estiver
                  logado. Atendimentos já atribuídos permanecem.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.operator_lunch_auto_status}
              onClick={() =>
                setForm({
                  ...form,
                  operator_lunch_auto_status: !form.operator_lunch_auto_status,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                form.operator_lunch_auto_status ? 'bg-success-500' : 'bg-ink-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  form.operator_lunch_auto_status ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                form.business_hours_enabled ? 'bg-success-500/20' : 'bg-brand-500/10'
              }`}
            >
              <Clock
                className={`w-5 h-5 ${
                  form.business_hours_enabled ? 'text-success-500' : 'text-brand-400'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Horário comercial</p>
              <p className="mt-0.5 text-xs text-ink-300">
                Horário de Brasília (America/Sao_Paulo). Dias não marcados e fora do
                intervalo contam como fora do expediente. O texto da mensagem fica em
                Mensagens Automáticas.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-800/60 px-3 py-2.5">
            <p className="text-sm font-medium text-white">Ativar horário comercial</p>
            <button
              type="button"
              role="switch"
              aria-checked={form.business_hours_enabled}
              aria-label="Ativar horário comercial"
              onClick={() =>
                setForm({ ...form, business_hours_enabled: !form.business_hours_enabled })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                form.business_hours_enabled ? 'bg-success-500' : 'bg-ink-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  form.business_hours_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {form.business_hours_enabled && (
            <>
              <div>
                <label className="label">Dias de funcionamento</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map(({ value, label }) => {
                    const active = form.business_days?.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleDay(value)}
                        aria-pressed={active}
                        className={`min-w-[2.75rem] rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Início do expediente</label>
                  <select
                    value={form.business_hours_start}
                    onChange={(e) =>
                      setForm({ ...form, business_hours_start: e.target.value })
                    }
                    className="input"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Fim do expediente</label>
                  <select
                    value={form.business_hours_end}
                    onChange={(e) => setForm({ ...form, business_hours_end: e.target.value })}
                    className="input"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      business_hours_start: '08:00',
                      business_hours_end: '18:00',
                    })
                  }
                  className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
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
                  className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
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
                  className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
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
                  className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
                >
                  Seg–Sex
                </button>
              </div>
            </>
          )}
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
