import { useState } from 'react';
import { useCannedResponses } from '../../hooks/useData';
import { api } from '../../lib/api';
import { Plus, Trash2, Zap, Loader2, X, Save } from 'lucide-react';
import type { CannedResponse } from '../../types';

export function CannedView() {
  const { canned, loading, refetch } = useCannedResponses();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const resetForm = () => {
    setShortcut('');
    setTitle('');
    setBody('');
    setShowAdd(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!shortcut.trim() || !title.trim() || !body.trim()) return;
    const payload = { shortcut, title, content: body };
    if (editing) {
      await api(`/quick-messages/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/quick-messages', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    resetForm();
    refetch();
  };

  const handleEdit = (c: CannedResponse) => {
    setEditing(c);
    setShortcut(c.shortcut);
    setTitle(c.title);
    setBody(c.body);
    setShowAdd(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Respostas Rápidas</h2>
          <p className="text-sm text-ink-300">Atalhos para textos longos (ex: /pix preenche dados de pagamento)</p>
        </div>
        <button onClick={() => { resetForm(); setShowAdd(!showAdd); }} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nova Resposta
        </button>
      </div>

      {showAdd && (
        <div className="card p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">{editing ? 'Editar Resposta' : 'Nova Resposta Rápida'}</h3>
            <button onClick={resetForm} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Atalho (comando)</label>
              <input
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                className="input"
                placeholder="/pix"
              />
            </div>
            <div>
              <label className="label">Título</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                placeholder="Dados de Pagamento PIX"
              />
            </div>
          </div>
          <div>
            <label className="label">Conteúdo da Mensagem</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="input resize-none"
              placeholder="Digite o texto completo que será enviado..."
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSave} className="btn-primary">
              <Save className="w-4 h-4" />
              {editing ? 'Atualizar' : 'Criar'}
            </button>
            <button onClick={resetForm} className="btn-ghost">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {canned.map((c) => (
          <div key={c.id} className="card p-4 flex items-start gap-3 group hover:border-ink-600 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <code className="text-sm font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">{c.shortcut}</code>
                <span className="text-sm font-medium text-white">{c.title}</span>
              </div>
              <p className="text-xs text-ink-300 line-clamp-2">{c.body}</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleEdit(c)} className="btn-ghost p-1.5 text-xs">
                Editar
              </button>
              <button
                onClick={async () => {
                  if (confirm(`Remover "${c.title}"?`)) {
                    await api(`/quick-messages/${c.id}`, { method: 'DELETE' });
                    refetch();
                  }
                }}
                className="btn-ghost p-1.5 text-danger-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {canned.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-ink-300">
            <Zap className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Nenhuma resposta rápida cadastrada</p>
          </div>
        )}
      </div>
    </div>
  );
}
