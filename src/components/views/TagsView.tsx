import { useState } from 'react';
import { useTags } from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Tag as TagIcon, Loader2, X } from 'lucide-react';
import type { Tag } from '../../types';

const COLOR_OPTIONS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export function TagsView() {
  const { tags, loading, refetch } = useTags();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    await supabase.from('tags').insert({ name: name.trim(), color });
    setName('');
    setColor(COLOR_OPTIONS[0]);
    setShowAdd(false);
    refetch();
  };

  const handleDelete = async (tag: Tag) => {
    if (confirm(`Remover a etiqueta "${tag.name}"?`)) {
      await supabase.from('tags').delete().eq('id', tag.id);
      refetch();
    }
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
          <h2 className="text-xl font-bold text-white">Etiquetas</h2>
          <p className="text-sm text-ink-300">{tags.length} etiquetas criadas</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nova Etiqueta
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Criar Nova Etiqueta</h3>
            <button onClick={() => setShowAdd(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input flex-1"
              placeholder="Nome da etiqueta (ex: Urgente, Vendas...)"
              autoFocus
            />
            <div className="flex gap-1 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-850 scale-110' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <button onClick={handleAdd} className="btn-primary">Criar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tags.map((tag) => (
          <div key={tag.id} className="card p-4 flex items-center justify-between group hover:border-ink-600 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${tag.color}20` }}>
                <TagIcon className="w-5 h-5" style={{ color: tag.color }} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{tag.name}</p>
                <p className="text-xs text-ink-300">{tag.color}</p>
              </div>
            </div>
            <button
              onClick={() => handleDelete(tag)}
              className="text-ink-300 hover:text-danger-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {tags.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-ink-300">
            <TagIcon className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Nenhuma etiqueta criada ainda</p>
          </div>
        )}
      </div>
    </div>
  );
}
