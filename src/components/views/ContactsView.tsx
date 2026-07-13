import { useState } from 'react';
import { useContacts } from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import { Search, Plus, RefreshCw, MessageSquare, Phone, Loader2, UserPlus } from 'lucide-react';
import type { Contact } from '../../types';

interface ContactsViewProps {
  onStartConversation: (ticketId: string) => void;
}

export function ContactsView({ onStartConversation }: ContactsViewProps) {
  const { contacts, loading, refetch } = useContacts();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [syncing, setSyncing] = useState(false);

  const filtered = contacts.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const phone = newPhone.replace(/\D/g, '');
    await supabase.from('contacts').insert({ name: newName.trim(), phone });
    setNewName('');
    setNewPhone('');
    setShowAdd(false);
    refetch();
  };

  const handleSync = async () => {
    setSyncing(true);
    // Simulate sync - in production this would pull from WhatsApp API
    await new Promise((r) => setTimeout(r, 1500));
    setSyncing(false);
    refetch();
  };

  const handleStartConversation = async (contact: Contact) => {
    // Check if there's already an active ticket for this contact
    const { data: existing } = await supabase
      .from('tickets')
      .select('id')
      .eq('contact_id', contact.id)
      .neq('status', 'finished')
      .maybeSingle();

    if (existing) {
      onStartConversation(existing.id);
      return;
    }

    // Create new ticket
    const { data, error } = await supabase
      .from('tickets')
      .insert({
        contact_id: contact.id,
        status: 'triage',
        department: 'support',
      })
      .select('id')
      .single();

    if (!error && data) {
      onStartConversation(data.id);
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
          <h2 className="text-xl font-bold text-white">Agenda de Contatos</h2>
          <p className="text-sm text-ink-300">{contacts.length} contatos salvos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSync} disabled={syncing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Novo Contato
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card p-4 animate-fade-in">
          <h3 className="text-sm font-semibold text-white mb-3">Adicionar Novo Contato</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Nome</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input" placeholder="Nome do contato" />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="input" placeholder="5511999999999" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleAdd} className="btn-primary">Salvar</button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="input pl-9"
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-800">
              <th className="text-left text-xs font-medium text-ink-200 px-4 py-3">Contato</th>
              <th className="text-left text-xs font-medium text-ink-200 px-4 py-3">Telefone</th>
              <th className="text-left text-xs font-medium text-ink-200 px-4 py-3 hidden md:table-cell">Criado em</th>
              <th className="text-right text-xs font-medium text-ink-200 px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-ink-700 hover:bg-ink-800 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-ink-700 flex items-center justify-center text-sm font-semibold text-ink-100">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-white">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-ink-200">
                    <Phone className="w-3.5 h-3.5 text-ink-300" />
                    {c.phone}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-ink-300 hidden md:table-cell">
                  {new Date(c.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleStartConversation(c)}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Nova Conversa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-ink-300">
            <UserPlus className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Nenhum contato encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
