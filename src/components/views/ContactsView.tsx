import { useState } from 'react';
import { useContacts, useWhatsappConnection } from '../../hooks/useData';
import { api } from '../../lib/api';
import { Search, Plus, RefreshCw, MessageSquare, Phone, Loader2, AlertCircle } from 'lucide-react';
import type { Contact } from '../../types';
import { ContactAvatar } from '../ContactAvatar';

interface ContactsViewProps {
  onStartConversation: (ticketId: string) => void;
}

export function ContactsView({ onStartConversation }: ContactsViewProps) {
  const { contacts, loading, refetch } = useContacts();
  const { connection } = useWhatsappConnection();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const filtered = contacts.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    setError(null);
    const phone = newPhone.replace(/\D/g, '');
    try {
      await api('/contacts', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), phone }),
      });
      setNewName('');
      setNewPhone('');
      setShowAdd(false);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar contato');
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
      const result = await api<{ imported?: number; ok?: boolean }>('/whatsapp/sync-contacts', {
        method: 'POST',
      });
      await refetch();
      setSyncMessage(
        `Agenda sincronizada. ${contacts.length} contatos na base${
          result?.imported != null ? ` (${result.imported} importados)` : ''
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handleStartConversation = async (contact: Contact) => {
    setError(null);
    try {
      const ticket = await api<{ id: string }>(`/contacts/${contact.id}/start-conversation`, {
        method: 'POST',
      });
      onStartConversation(ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar conversa');
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

      {error && (
        <div className="card p-3 flex items-start gap-2 text-sm text-danger-400 border-danger-500/30 bg-danger-500/10">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="card p-3 text-sm text-ink-200 border-brand-500/30 bg-brand-500/10">
          {syncMessage}
        </div>
      )}

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
            <tr className="border-b border-ink-700 text-xs text-ink-300">
              <th className="text-left p-3 font-medium">Nome</th>
              <th className="text-left p-3 font-medium">Telefone</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-sm text-ink-300">
                  Nenhum contato encontrado. Conecte o WhatsApp e clique em Sincronizar para importar a agenda.
                </td>
              </tr>
            ) : (
              filtered.map((contact) => (
                <tr key={contact.id} className="border-b border-ink-800 hover:bg-ink-800/50 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ContactAvatar
                        name={contact.name}
                        profilePicUrl={contact.profile_pic_url}
                        size="sm"
                        rounded="lg"
                      />
                      <span className="text-sm text-white">{contact.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="text-sm text-ink-300 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {contact.phone}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleStartConversation(contact)}
                      className="btn-secondary text-xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Conversar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
