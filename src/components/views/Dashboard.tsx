import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { mapContact, mapTicket } from '../../lib/mappers';
import { useNpsRatings, useProfiles } from '../../hooks/useData';
import {
  MessageSquare,
  CheckCircle,
  Clock,
  Ticket as TicketIcon,
  Download,
  FileText,
  TrendingUp,
  Star,
  Users,
  Loader2,
  Filter,
} from 'lucide-react';
import type { Ticket, Contact } from '../../types';
import { downloadDashboardReportPdf } from '../../lib/dashboardReportPdf';

interface DashboardProps {
  onNavigateToChat: () => void;
}

function toDayInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return toDayInput(d);
}

export function Dashboard({ onNavigateToChat }: DashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [avgResponseTime, setAvgResponseTime] = useState<string>('—');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<{
    total?: number;
    openCount: number;
    closedToday: number;
    awaiting: number;
    byStatus: { status: string; count: number }[];
  } | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterRating, setFilterRating] = useState('');

  const { summary: npsSummary } = useNpsRatings();
  const { profiles } = useProfiles();

  const agents = useMemo(
    () =>
      profiles
        .filter((p) =>
          ['OPERATOR', 'ADMIN', 'SUPERVISOR'].includes(String(p.apiRole ?? '').toUpperCase()),
        )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [profiles],
  );

  useEffect(() => {
    (async () => {
      try {
        const [metricsData, ticketsData, contactsData] = await Promise.all([
          api<any>('/dashboard/metrics'),
          api<any[]>('/tickets'),
          api<any[]>('/contacts'),
        ]);
        setMetrics(metricsData);
        setTickets((ticketsData || []).map(mapTicket));
        setContacts((contactsData || []).map(mapContact));
        setAvgResponseTime('—');
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeCount =
    metrics?.byStatus?.find((s) => s.status === 'EM_ATENDIMENTO')?.count ??
    tickets.filter((t) => t.status === 'attending').length;
  const triageCount =
    (metrics?.byStatus?.find((s) => s.status === 'EM_TRIAGEM')?.count ?? 0) +
    (metrics?.awaiting ?? tickets.filter((t) => t.status === 'triage').length);
  const finishedCount =
    metrics?.byStatus?.find((s) => s.status === 'FECHADO')?.count ??
    tickets.filter((t) => t.status === 'finished').length;
  const finishedTickets = tickets.filter((t) => t.status === 'finished');

  const npsData = useMemo(() => {
    const total = npsSummary?.total ?? 0;
    const dist = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: npsSummary?.distribution?.[star] ?? 0,
    }));
    const avg = npsSummary?.average ?? 0;
    return { total, dist, avg };
  }, [npsSummary]);

  const applyPreset = (days: number | 'all') => {
    if (days === 'all') {
      setFilterFrom('');
      setFilterTo('');
      return;
    }
    setFilterFrom(daysAgo(days - 1));
    setFilterTo(toDayInput(new Date()));
  };

  const clearFilters = () => {
    setFilterFrom('');
    setFilterTo('');
    setFilterUserId('');
    setFilterRating('');
    setReportError(null);
  };

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

  const exportReportPdf = async () => {
    if (filterFrom && filterTo && filterFrom > filterTo) {
      setReportError('A data inicial não pode ser maior que a final.');
      return;
    }
    setReportError(null);
    setExportingPdf(true);
    try {
      const params = new URLSearchParams();
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterUserId) params.set('assigneeId', filterUserId);
      if (filterRating) params.set('rating', filterRating);
      const qs = params.toString();
      const report = await api<{
        filters: {
          from: string | null;
          to: string | null;
          assigneeId: string | null;
          assigneeName: string | null;
          rating: number | null;
        };
        total: number;
        openCount: number;
        awaiting: number;
        activeCount: number;
        finishedCount: number;
        closedInPeriod: number;
        byStatus: { status: string; count: number }[];
        nps: {
          total: number;
          average: number | null;
          distribution: Record<number, number>;
        };
      }>(`/dashboard/report${qs ? `?${qs}` : ''}`);

      downloadDashboardReportPdf({
        generatedAt: new Date(),
        filters: report.filters,
        activeCount: report.activeCount,
        finishedCount: report.finishedCount,
        openCount: report.openCount,
        awaiting: report.awaiting,
        closedInPeriod: report.closedInPeriod,
        totalTickets: report.total,
        avgResponseTime,
        byStatus: report.byStatus,
        nps: {
          total: report.nps.total,
          average: report.nps.average,
          distribution: {
            1: report.nps.distribution?.[1] ?? 0,
            2: report.nps.distribution?.[2] ?? 0,
            3: report.nps.distribution?.[3] ?? 0,
            4: report.nps.distribution?.[4] ?? 0,
            5: report.nps.distribution?.[5] ?? 0,
          },
        },
      });
    } catch (err) {
      console.error('Report export error:', err);
      setReportError(err instanceof Error ? err.message : 'Falha ao gerar relatório');
    } finally {
      setExportingPdf(false);
    }
  };

  const metricCards = [
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
      value: triageCount || metrics?.openCount || 0,
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-ink-300">Visão geral do atendimento</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => void exportReportPdf()}
            disabled={exportingPdf}
            className="btn-primary"
            title="Baixar relatório PDF com os filtros selecionados"
          >
            {exportingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Gerar Relatório PDF
          </button>
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

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-white">Filtros do relatório</h3>
          <span className="text-xs text-ink-300 ml-auto">Aplicados ao PDF</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={() => applyPreset(7)}>
            7 dias
          </button>
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={() => applyPreset(30)}>
            30 dias
          </button>
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={() => applyPreset(90)}>
            90 dias
          </button>
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={() => applyPreset('all')}>
            Todo período
          </button>
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label" htmlFor="report-from">
              De
            </label>
            <input
              id="report-from"
              type="date"
              className="input"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="report-to">
              Até
            </label>
            <input
              id="report-to"
              type="date"
              className="input"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="report-user">
              Usuário
            </label>
            <select
              id="report-user"
              className="input"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
            >
              <option value="">Todos os usuários</option>
              {agents.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="report-rating">
              Avaliação (NPS)
            </label>
            <select
              id="report-rating"
              className="input"
              value={filterRating}
              onChange={(e) => setFilterRating(e.target.value)}
            >
              <option value="">Todas</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={String(n)}>
                  {n} estrela{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {reportError && <p className="text-sm text-danger-400">{reportError}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((m, i) => (
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
                <span className="text-3xl font-bold text-white">{Number(npsData.avg).toFixed(1)}</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${s <= Math.round(Number(npsData.avg)) ? 'text-warning-400 fill-warning-400' : 'text-ink-600'}`}
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
