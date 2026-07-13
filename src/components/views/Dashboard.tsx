import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useNpsRatings } from '../../hooks/useData';
import {
  MessageSquare,
  CheckCircle,
  Clock,
  Ticket as TicketIcon,
  Download,
  TrendingUp,
  Star,
  Users,
  Loader2,
} from 'lucide-react';
import type { Ticket, Contact } from '../../types';

interface DashboardProps {
  onNavigateToChat: () => void;
}

export function Dashboard({ onNavigateToChat }: DashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [finishedTickets, setFinishedTickets] = useState<Ticket[]>([]);
  const [avgResponseTime, setAvgResponseTime] = useState<string>('—');
  const [loading, setLoading] = useState(true);
  const { ratings } = useNpsRatings();

  useEffect(() => {
    (async () => {
      const [{ data: tData }, { data: cData }] = await Promise.all([
        supabase
          .from('tickets')
          .select('*, contact:contacts(*)')
          .order('created_at', { ascending: false }),
        supabase.from('contacts').select('*'),
      ]);

      const allTickets = (tData || []) as unknown as Ticket[];
      setTickets(allTickets);
      setContacts((cData || []) as Contact[]);
      setFinishedTickets(allTickets.filter((t) => t.status === 'finished'));

      // Calculate avg response time from messages
      const { data: msgData } = await supabase
        .from('messages')
        .select('ticket_id, sender_type, created_at')
        .order('created_at', { ascending: true });

      if (msgData && msgData.length > 0) {
        const byTicket: Record<string, typeof msgData> = {};
        msgData.forEach((m) => {
          if (!byTicket[m.ticket_id]) byTicket[m.ticket_id] = [];
          byTicket[m.ticket_id].push(m);
        });

        let totalMs = 0;
        let count = 0;
        Object.values(byTicket).forEach((msgs) => {
          for (let i = 1; i < msgs.length; i++) {
            if (msgs[i - 1].sender_type === 'client' && msgs[i].sender_type === 'agent') {
              const diff = new Date(msgs[i].created_at).getTime() - new Date(msgs[i - 1].created_at).getTime();
              if (diff > 0 && diff < 3600000 * 24) {
                totalMs += diff;
                count++;
              }
            }
          }
        });
        if (count > 0) {
          const avgMs = totalMs / count;
          const mins = Math.floor(avgMs / 60000);
          const secs = Math.floor((avgMs % 60000) / 1000);
          setAvgResponseTime(`${mins}m ${secs}s`);
        }
      }
      setLoading(false);
    })();
  }, []);

  const activeCount = tickets.filter((t) => t.status === 'attending').length;
  const triageCount = tickets.filter((t) => t.status === 'triage').length;
  const finishedCount = finishedTickets.length;

  const npsData = useMemo(() => {
    const rated = ratings.filter((r) => r.rating !== null);
    const total = rated.length;
    const dist = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: rated.filter((r) => r.rating === star).length,
    }));
    const avg = total > 0 ? rated.reduce((s, r) => s + (r.rating || 0), 0) / total : 0;
    return { total, dist, avg };
  }, [ratings]);

  const exportContactsCSV = () => {
    const headers = ['Nome', 'Telefone', 'Criado em'];
    const rows = contacts.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.phone}"`,
      new Date(c.created_at).toLocaleString('pt-BR'),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV(csv, 'contatos.csv');
  };

  const exportTicketsCSV = () => {
    const headers = ['ID', 'Contato', 'Telefone', 'Status', 'Departamento', 'Prioridade', 'Criado em', 'Finalizado em'];
    const rows = finishedTickets.map((t) => [
      `"${t.id}"`,
      `"${t.contact?.name ?? ''}"`,
      `"${t.contact?.phone ?? ''}"`,
      'Finalizado',
      t.department,
      t.priority,
      new Date(t.created_at).toLocaleString('pt-BR'),
      t.finished_at ? new Date(t.finished_at).toLocaleString('pt-BR') : '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV(csv, 'tickets_finalizados.csv');
  };

  const metrics = [
    {
      label: 'Conversas Ativas',
      value: activeCount,
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'text-brand-400',
      bg: 'bg-brand-500/10',
    },
    {
      label: 'Tickets Finalizados',
      value: finishedCount,
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'text-success-500',
      bg: 'bg-success-500/10',
    },
    {
      label: 'Tempo Médio de Resposta',
      value: avgResponseTime,
      icon: <Clock className="w-5 h-5" />,
      color: 'text-warning-400',
      bg: 'bg-warning-500/10',
    },
    {
      label: 'Tickets em Aberto',
      value: triageCount,
      icon: <TicketIcon className="w-5 h-5" />,
      color: 'text-danger-400',
      bg: 'bg-danger-500/10',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-ink-300">Visão geral do atendimento</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportContactsCSV} className="btn-secondary">
            <Download className="w-4 h-4" />
            Exportar Contatos
          </button>
          <button onClick={exportTicketsCSV} className="btn-secondary">
            <Download className="w-4 h-4" />
            Exportar Tickets
          </button>
        </div>
      </div>

      {/* Metrics cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="card p-5 hover:border-ink-600 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${m.bg} ${m.color} flex items-center justify-center`}>
                {m.icon}
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{m.value}</p>
            <p className="text-sm text-ink-300 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NPS Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-warning-400" />
              <h3 className="text-sm font-semibold text-white">Avaliação de Atendimento (NPS)</h3>
            </div>
            <span className="text-xs text-ink-300">{npsData.total} avaliações</span>
          </div>

          {npsData.total === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-ink-300">
              <Star className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma avaliação recebida ainda</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl font-bold text-white">{npsData.avg.toFixed(1)}</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${s <= Math.round(npsData.avg) ? 'text-warning-400 fill-warning-400' : 'text-ink-600'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {npsData.dist.map((d) => (
                  <div key={d.star} className="flex items-center gap-3">
                    <span className="text-xs text-ink-200 w-4">{d.star}★</span>
                    <div className="flex-1 h-6 bg-ink-800 rounded-md overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-warning-500 to-warning-400 rounded-md transition-all duration-500"
                        style={{ width: `${npsData.total > 0 ? (d.count / npsData.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink-300 w-8 text-right">{d.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recent tickets */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-400" />
              <h3 className="text-sm font-semibold text-white">Tickets Recentes</h3>
            </div>
            <button onClick={onNavigateToChat} className="text-xs text-brand-400 hover:text-brand-300">
              Ver todos →
            </button>
          </div>
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-ink-300">
              <TicketIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum ticket ainda</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tickets.slice(0, 6).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-ink-800 cursor-pointer"
                  onClick={onNavigateToChat}
                >
                  <div className="w-8 h-8 rounded-full bg-ink-700 flex items-center justify-center text-xs font-semibold text-ink-100">
                    {t.contact?.name?.charAt(0).toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{t.contact?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-ink-300 capitalize">{t.status} · {t.department}</p>
                  </div>
                  {t.unread_count > 0 && (
                    <span className="badge bg-danger-500 text-white justify-center min-w-[20px]">{t.unread_count}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contacts summary */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-brand-400" />
          <h3 className="text-sm font-semibold text-white">Contatos Salvos</h3>
          <span className="text-xs text-ink-300 ml-auto">{contacts.length} contatos</span>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-ink-300 py-4 text-center">Nenhum contato sincronizado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contacts.slice(0, 20).map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink-800 text-sm">
                <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center text-xs text-white">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-ink-100">{c.name}</span>
                <span className="text-ink-300 text-xs">{c.phone}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
