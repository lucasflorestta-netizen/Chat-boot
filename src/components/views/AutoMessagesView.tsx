import { useState, useEffect, useRef } from 'react';
import { useAutoMessageSettings } from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import type { AutoMessageSettings } from '../../types';
import { Save, Loader2, MessageSquare, Bot, UserCheck, CheckCircle, Star, Power, Check, AlertCircle } from 'lucide-react';

const DEFAULT_SETTINGS: Omit<AutoMessageSettings, 'id' | 'updated_at'> = {
  greeting_message: 'Olá! Bem-vindo ao nosso atendimento. Como podemos ajudar?',
  bot_menu_active: true,
  bot_menu_message: 'Digite o número do setor desejado:\n1 - Suporte\n2 - Vendas',
  takeover_message: 'Olá! Sou {{agente}} e vou continuar seu atendimento. Em que posso ajudar?',
  closing_message: 'Seu atendimento foi finalizado. Obrigado pelo contato!',
  nps_question: 'Como você avalia nosso atendimento hoje? Digite de 1 a 5.',
  nps_active: true,
};

export function AutoMessagesView() {
  const { settings, loading, refetch } = useAutoMessageSettings();
  const [form, setForm] = useState<AutoMessageSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ensuring, setEnsuring] = useState(false);
  const seedAttempted = useRef(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  // Seed singleton row if missing so the form never spins forever
  useEffect(() => {
    if (loading || settings || seedAttempted.current) return;
    seedAttempted.current = true;
    let cancelled = false;
    (async () => {
      setEnsuring(true);
      const { data, error } = await supabase
        .from('auto_message_settings')
        .insert(DEFAULT_SETTINGS)
        .select('*')
        .single();
      if (!cancelled) {
        if (error) console.error('Error seeding auto_message_settings:', error);
        else if (data) setForm(data as AutoMessageSettings);
        await refetch();
        setEnsuring(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, settings, refetch]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        greeting_message: form.greeting_message,
        bot_menu_active: form.bot_menu_active,
        bot_menu_message: form.bot_menu_message,
        takeover_message: form.takeover_message,
        closing_message: form.closing_message,
        nps_question: form.nps_question,
        nps_active: form.nps_active,
      };

      if (form.id) {
        const { error } = await supabase
          .from('auto_message_settings')
          .update(payload)
          .eq('id', form.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('auto_message_settings')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;
        if (data) setForm(data as AutoMessageSettings);
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

  if (loading || ensuring || !form) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Mensagens Automáticas</h2>
          <p className="text-sm text-ink-300">Configure os textos de automação do bot</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
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

      {/* Bot menu toggle */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
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
            onClick={() => setForm({ ...form, bot_menu_active: !form.bot_menu_active })}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.bot_menu_active ? 'bg-success-500' : 'bg-ink-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.bot_menu_active ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Greeting message */}
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

      {/* Bot menu message */}
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
          disabled={!form.bot_menu_active}
        />
        <p className="text-xs text-ink-300 mt-2">
          Use o formato: &quot;Digite 1 para Suporte ou 2 para Vendas&quot;. O sistema reconhece os números automaticamente.
        </p>
      </SettingCard>

      {/* Takeover message */}
      <SettingCard
        icon={<UserCheck className="w-5 h-5" />}
        title="Mensagem de Assumir Atendimento"
        description="Enviada quando um agente assume o ticket. Use {{agente}} para o nome do atendente."
      >
        <textarea
          value={form.takeover_message}
          onChange={(e) => setForm({ ...form, takeover_message: e.target.value })}
          rows={3}
          className="input resize-none"
        />
      </SettingCard>

      {/* Closing message */}
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

      {/* NPS question */}
      <SettingCard
        icon={<Star className="w-5 h-5" />}
        title="Pesquisa de Satisfação (NPS)"
        description="Enviada após a finalização do ticket para avaliar o atendimento"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-ink-200">Ativar pesquisa NPS</span>
          <button
            onClick={() => setForm({ ...form, nps_active: !form.nps_active })}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.nps_active ? 'bg-success-500' : 'bg-ink-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.nps_active ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <textarea
          value={form.nps_question}
          onChange={(e) => setForm({ ...form, nps_question: e.target.value })}
          rows={2}
          className="input resize-none"
          disabled={!form.nps_active}
        />
      </SettingCard>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar Todas as Configurações
      </button>
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
    <div className="card p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-ink-300 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
