import { useState, useEffect } from 'react';
import { useAutoMessageSettings } from '../../hooks/useData';
import { api } from '../../lib/api';
import { mapAutoSettings } from '../../lib/mappers';
import type { AutoMessageSettings } from '../../types';
import { Save, Loader2, MessageSquare, Bot, UserCheck, CheckCircle, Star, Power, Check, AlertCircle, Moon, Clock, Link2 } from 'lucide-react';

export function AutoMessagesView() {
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

    setSaving(true);
    setFeedback(null);
    try {
      const data = await api<any>('/auto-message-settings', {
        method: 'PUT',
        body: JSON.stringify({
          greetingMessage: form.greeting_message,
          botMenuActive: form.bot_menu_active,
          botMenuMessage: form.bot_menu_message,
          takeoverMessage: form.takeover_message,
          closingMessage: form.closing_message,
          npsQuestion: form.nps_question,
          npsActive: form.nps_active,
          afterHoursMessage: form.after_hours_message,
          inactivityEnabled: form.inactivity_enabled,
          inactivityWarningMessage: form.inactivity_warning_message,
          inactivityWarningMinutes: warnMin,
          inactivityClosingMessage: form.inactivity_closing_message,
          inactivityClosingMinutes: closeMin,
          satisfactionFormUrl: form.satisfaction_form_url?.trim() ?? '',
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
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Mensagens Automáticas</h2>
            <p className="text-sm text-ink-300">Configure os textos de automação do bot</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary shrink-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Configurações
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
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${form.bot_menu_active ? 'bg-success-500/20' : 'bg-ink-700'}`}>
                <Power className={`w-5 h-5 ${form.bot_menu_active ? 'text-success-500' : 'text-ink-300'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Menu de Autoatendimento (Bot)</p>
                <p className="text-xs text-ink-300">Ativa/desativa a árvore do menu de triagem</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.bot_menu_active}
              onClick={() => setForm({ ...form, bot_menu_active: !form.bot_menu_active })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.bot_menu_active ? 'bg-success-500' : 'bg-ink-600'}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  form.bot_menu_active ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingCard
            icon={<MessageSquare className="w-5 h-5" />}
            title="Mensagem de Saudação (Boas-vindas)"
            description="Enviada automaticamente quando um cliente novo envia sua primeira mensagem"
          >
            <textarea
              value={form.greeting_message}
              onChange={(e) => setForm({ ...form, greeting_message: e.target.value })}
              rows={3}
              className="input resize-none"
            />
          </SettingCard>

          <SettingCard
            icon={<Bot className="w-5 h-5" />}
            title="Mensagem do Menu de Opções"
            description="Menu numérico para o cliente escolher o setor (ex: 1-Suporte, 2-Vendas)"
          >
            <textarea
              value={form.bot_menu_message}
              onChange={(e) => setForm({ ...form, bot_menu_message: e.target.value })}
              rows={4}
              className="input resize-none"
            />
            <p className="mt-2 text-xs text-ink-300">
              Use o formato: &quot;Digite 1 para Suporte ou 2 para Vendas&quot;. O sistema reconhece os números automaticamente.
            </p>
          </SettingCard>

          <SettingCard
            icon={<UserCheck className="w-5 h-5" />}
            title="Mensagem de Assumir Atendimento"
            description="Enviada automaticamente quando um agente assume o ticket. O nome do atendente é inserido no lugar de {{agente}}."
          >
            <textarea
              value={form.takeover_message}
              onChange={(e) => setForm({ ...form, takeover_message: e.target.value })}
              rows={3}
              className="input resize-none"
              placeholder="Conversa assumida pelo {{agente}}"
            />
          </SettingCard>

          <SettingCard
            icon={<CheckCircle className="w-5 h-5" />}
            title="Mensagem de Finalização"
            description="Enviada automaticamente quando o ticket é finalizado pelo agente"
          >
            <textarea
              value={form.closing_message}
              onChange={(e) => setForm({ ...form, closing_message: e.target.value })}
              rows={3}
              className="input resize-none"
            />
          </SettingCard>

          <SettingCard
            icon={<Moon className="w-5 h-5" />}
            title="Mensagem de Fim de Expediente"
            description="Enviada automaticamente quando um cliente entra em contato fora do horário de atendimento. Configure o horário em Configurações."
          >
            <textarea
              value={form.after_hours_message}
              onChange={(e) => setForm({ ...form, after_hours_message: e.target.value })}
              rows={3}
              className="input resize-none"
              placeholder="No momento estamos fora do horário de atendimento. Retornaremos assim que possível."
            />
          </SettingCard>
        </div>

        <SettingCard
          icon={<Clock className="w-5 h-5" />}
          title="Inatividade do cliente"
          description="Quando o cliente demora para responder após a última mensagem do atendente, o sistema envia um aviso e depois encerra o ticket."
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-ink-200">Ativar encerramento por inatividade</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.inactivity_enabled}
              onClick={() =>
                setForm({ ...form, inactivity_enabled: !form.inactivity_enabled })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                form.inactivity_enabled ? 'bg-success-500' : 'bg-ink-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  form.inactivity_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div
            className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${
              form.inactivity_enabled ? '' : 'pointer-events-none opacity-50'
            }`}
          >
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm text-ink-200">Mensagem de aviso</label>
                <textarea
                  value={form.inactivity_warning_message}
                  onChange={(e) =>
                    setForm({ ...form, inactivity_warning_message: e.target.value })
                  }
                  rows={3}
                  className="input resize-none"
                  disabled={!form.inactivity_enabled}
                  placeholder="Ainda está aí? Não tivemos retorno, em breve o atendimento será encerrado."
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-ink-200">
                  Enviar aviso após (minutos)
                </label>
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
                  className="input"
                  disabled={!form.inactivity_enabled}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm text-ink-200">
                  Mensagem de encerramento
                </label>
                <textarea
                  value={form.inactivity_closing_message}
                  onChange={(e) =>
                    setForm({ ...form, inactivity_closing_message: e.target.value })
                  }
                  rows={3}
                  className="input resize-none"
                  disabled={!form.inactivity_enabled}
                  placeholder="Encerramos seu atendimento por inatividade. Obrigado!"
                />
                <p className="mt-2 text-xs text-ink-300">
                  Opcional: use {'{{protocol}}'} no texto.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-ink-200">
                  Encerrar atendimento após (minutos)
                </label>
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
                  className="input"
                  disabled={!form.inactivity_enabled}
                />
              </div>
            </div>
          </div>
        </SettingCard>

        <SettingCard
          icon={<Star className="w-5 h-5" />}
          title="Pesquisa de Satisfação (NPS)"
          description="Enviada após a finalização do ticket para avaliar o atendimento"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-ink-200">Ativar pesquisa NPS</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.nps_active}
              onClick={() => setForm({ ...form, nps_active: !form.nps_active })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.nps_active ? 'bg-success-500' : 'bg-ink-600'}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  form.nps_active ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <textarea
            value={form.nps_question}
            onChange={(e) => setForm({ ...form, nps_question: e.target.value })}
            rows={2}
            className="input resize-none"
          />
        </SettingCard>

        <SettingCard
          icon={<Link2 className="w-5 h-5" />}
          title="Formulário de Satisfação (Google Forms)"
          description="Opcional. Link anexado ao encerrar por inatividade ou ao usar o atalho /fim"
        >
          <label className="mb-1.5 block text-sm text-ink-200">
            URL do formulário{' '}
            <span className="font-normal text-ink-400">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.satisfaction_form_url ?? ''}
            onChange={(e) =>
              setForm({ ...form, satisfaction_form_url: e.target.value })
            }
            className="input"
            placeholder="https://docs.google.com/forms/d/e/.../viewform"
          />
          <p className="mt-2 text-xs text-ink-300">
            Pode deixar em branco. Se preenchido, o parâmetro{' '}
            <code className="text-ink-200">?ticket=&lt;protocolo&gt;</code> é anexado
            automaticamente. Se vazio, usa{' '}
            <code className="text-ink-200">SATISFACTION_FORM_URL</code> do .env (se
            existir); caso contrário, nenhum link é enviado.
          </p>
        </SettingCard>

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Todas as Configurações
        </button>
      </div>
    </div>
  );
}

function SettingCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card flex h-full flex-col p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-xs text-ink-300">{description}</p>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
