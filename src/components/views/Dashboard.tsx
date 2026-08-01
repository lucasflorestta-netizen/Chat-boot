import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { mapTicket } from '../../lib/mappers';
import { formatPhone } from '../../lib/formatPhone';
import { useNpsRatings, useProfiles } from '../../hooks/useData';
import {
  MessageSquare,
  CheckCircle,
  Clock,
  Ticket as TicketIcon,
  Download,
  FileText,
  Star,
  Loader2,
  Filter,
  Users,
  Search,
  X,
  ChevronDown,
  LayoutGrid,
  List,
} from 'lucide-react';
import type { Ticket } from '../../types';
import { downloadDashboardReportPdf } from '../../lib/dashboardReportPdf';

interface DashboardProps {
  onNavigateToChat: () => void;
  onOpenTicket?: (ticketId: string) => void;
}

type ByAttendantRow = {
  assigneeId: string;
  name: string;
  username: string;
  count: number;
};

type MetricCardKey = 'active' | 'finished' | 'avgResponse' | 'open';

type NpsRatingRow = {
  id: string;
  rating: number | null;
  createdAt: string;
  contact: { id: string; name: string; phone: string | null; jid: string };
  ticket: {
    id: string;
    protocolo: string;
    subject: string | null;
    finishedAt: string | null;
    assigneeId: string | null;
    assigneeName: string | null;
  };
};

const VISIBLE_CARDS_KEY = 'dashboard.visibleCards';

const DEFAULT_VISIBLE_CARDS: Record<MetricCardKey, boolean> = {
  active: true,
  finished: false,
  avgResponse: true,
  open: true,
};

const CARD_LABELS: Record<MetricCardKey, string> = {
  active: 'Conversas Ativas',
  finished: 'Tickets Finalizados',
  avgResponse: 'Tempo Médio de Resposta',
  open: 'Tickets em Aberto',
};

function loadVisibleCards(): Record<MetricCardKey, boolean> {
  try {
    const raw = localStorage.getItem(VISIBLE_CARDS_KEY);
    if (!raw) return { ...DEFAULT_VISIBLE_CARDS };
    const parsed = JSON.parse(raw) as Partial<Record<MetricCardKey, boolean>>;
    return {
      active: parsed.active ?? DEFAULT_VISIBLE_CARDS.active,
      finished: parsed.finished ?? DEFAULT_VISIBLE_CARDS.finished,
      avgResponse: parsed.avgResponse ?? DEFAULT_VISIBLE_CARDS.avgResponse,
      open: parsed.open ?? DEFAULT_VISIBLE_CARDS.open,
    };
  } catch {
    return { ...DEFAULT_VISIBLE_CARDS };
  }
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

function formatDayPt(isoDay: string): string {
  return isoDay.split('-').reverse().join('/');
}

/** Formata ms → "45s" | "12 min" | "1h 5min" (fallback se a API só mandar ms). */
function formatAvgResponseLabel(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function resolveAvgResponseLabel(data: {
  avgResponseLabel?: string | null;
  avgResponseMs?: number | null;
}): string {
  if (typeof data.avgResponseLabel === 'string' && data.avgResponseLabel.length > 0) {
    return data.avgResponseLabel;
  }
  return formatAvgResponseLabel(data.avgResponseMs);
}

export function Dashboard({ onNavigateToChat, onOpenTicket }: DashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
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

  const [filterFrom, setFilterFrom] = useState(() => toDayInput(new Date()));
  const [filterTo, setFilterTo] = useState(() => toDayInput(new Date()));
  const [filterUserId, setFilterUserId] = useState('');
  const [filterRating, setFilterRating] = useState('');

  const [byAttendant, setByAttendant] = useState<ByAttendantRow[]>([]);
  const [byAttendantTotal, setByAttendantTotal] = useState(0);
  const [byAttendantLoading, setByAttendantLoading] = useState(false);
  const [byAttendantError, setByAttendantError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailName, setDetailName] = useState('');
  const [detailTickets, setDetailTickets] = useState<Ticket[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [visibleCards, setVisibleCards] = useState<Record<MetricCardKey, boolean>>(loadVisibleCards);
  const [cardsMenuOpen, setCardsMenuOpen] = useState(false);
  const cardsMenuRef = useRef<HTMLDivElement>(null);

  const [npsRatings, setNpsRatings] = useState<NpsRatingRow[]>([]);
  const [npsRatingsTotal, setNpsRatingsTotal] = useState(0);
  const [npsRatingsLoading, setNpsRatingsLoading] = useState(false);
  const [npsRatingsError, setNpsRatingsError] = useState<string | null>(null);
  const [npsListOpen, setNpsListOpen] = useState(false);

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

  const loadByAttendant = useCallback(async (from: string, to: string) => {
    if (from && to && from > to) {
      setByAttendantError('A data inicial não pode ser maior que a final.');
      setByAttendant([]);
      setByAttendantTotal(0);
      return;
    }
    setByAttendantError(null);
    setByAttendantLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      const data = await api<{
        total: number;
        byAttendant: ByAttendantRow[];
      }>(`/dashboard/by-attendant${qs ? `?${qs}` : ''}`);
      setByAttendant(data.byAttendant ?? []);
      setByAttendantTotal(data.total ?? 0);
    } catch (err) {
      console.error('By-attendant load error:', err);
      setByAttendantError(
        err instanceof Error ? err.message : 'Falha ao carregar atendimentos por usuário',
      );
      setByAttendant([]);
      setByAttendantTotal(0);
    } finally {
      setByAttendantLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [metricsData, ticketsData] = await Promise.all([
          api<{
            openCount: number;
            closedToday: number;
            awaiting: number;
            avgResponseMs?: number | null;
            avgResponseLabel?: string;
            byStatus: { status: string; count: number }[];
          }>('/dashboard/metrics'),
          api<any[]>('/tickets'),
        ]);
        setMetrics(metricsData);
        setTickets((ticketsData || []).map(mapTicket));
        // KPI global (igual aos outros cards) — filtros do topo valem para gráfico/NPS/PDF.
        setAvgResponseTime(resolveAvgResponseLabel(metricsData));
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void loadByAttendant(filterFrom, filterTo);
  }, [filterFrom, filterTo, loadByAttendant]);

  const loadNpsRatings = useCallback(async (from: string, to: string, userId: string, rating: string) => {
    if (from && to && from > to) {
      setNpsRatingsError('A data inicial não pode ser maior que a final.');
      setNpsRatings([]);
      setNpsRatingsTotal(0);
      return;
    }
    setNpsRatingsError(null);
    setNpsRatingsLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (userId) params.set('assigneeId', userId);
      if (rating) params.set('rating', rating);
      const qs = params.toString();
      const data = await api<{ total: number; ratings: NpsRatingRow[] }>(
        `/dashboard/nps-ratings${qs ? `?${qs}` : ''}`,
      );
      setNpsRatings(data.ratings ?? []);
      setNpsRatingsTotal(data.total ?? 0);
    } catch (err) {
      console.error('NPS ratings load error:', err);
      const raw = err instanceof Error ? err.message : '';
      setNpsRatingsError(
        /cannot get|not found|404/i.test(raw)
          ? 'Não foi possível carregar a lista. Reinicie a API e tente novamente.'
          : raw || 'Falha ao carregar avaliações NPS',
      );
      setNpsRatings([]);
      setNpsRatingsTotal(0);
    } finally {
      setNpsRatingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!npsListOpen) return;
    void loadNpsRatings(filterFrom, filterTo, filterUserId, filterRating);
  }, [npsListOpen, filterFrom, filterTo, filterUserId, filterRating, loadNpsRatings]);

  useEffect(() => {
    if (!cardsMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (cardsMenuRef.current && !cardsMenuRef.current.contains(e.target as Node)) {
        setCardsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [cardsMenuOpen]);

  const toggleCardVisibility = (key: MetricCardKey) => {
    setVisibleCards((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(VISIBLE_CARDS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openAttendantDetail = async (row: ByAttendantRow) => {
    if (row.count <= 0) return;
    setDetailOpen(true);
    setDetailName(row.name);
    setDetailTickets([]);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('assigneeId', row.assigneeId);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      const data = await api<{ tickets: any[] }>(
        `/dashboard/by-attendant/tickets?${params.toString()}`,
      );
      setDetailTickets((data.tickets || []).map(mapTicket));
    } catch (err) {
      console.error('Attendant detail load error:', err);
      setDetailError(
        err instanceof Error ? err.message : 'Falha ao carregar atendimentos',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeAttendantDetail = () => {
    setDetailOpen(false);
    setDetailTickets([]);
    setDetailError(null);
    setDetailName('');
  };

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

  const maxAttendantCount = useMemo(
    () => Math.max(0, ...byAttendant.map((row) => row.count)),
    [byAttendant],
  );

  const applyPreset = (days: number | 'all' | 'today') => {
    if (days === 'all') {
      setFilterFrom('');
      setFilterTo('');
      return;
    }
    if (days === 'today') {
      const today = toDayInput(new Date());
      setFilterFrom(today);
      setFilterTo(today);
      return;
    }
    setFilterFrom(daysAgo(days - 1));
    setFilterTo(toDayInput(new Date()));
  };

  const clearFilters = () => {
    const today = toDayInput(new Date());
    setFilterFrom(today);
    setFilterTo(today);
    setFilterUserId('');
    setFilterRating('');
    setReportError(null);
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
        avgResponseLabel?: string;
        avgResponseMs?: number | null;
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
        avgResponseTime: resolveAvgResponseLabel(report) || avgResponseTime,
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

  const metricCards: {
    key: MetricCardKey;
    label: string;
    value: string | number;
    icon: ReactNode;
    color: string;
    bg: string;
  }[] = [
    {
      key: 'active',
      label: CARD_LABELS.active,
      value: activeCount,
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'text-brand-400',
      bg: 'bg-brand-500/10',
    },
    {
      key: 'finished',
      label: CARD_LABELS.finished,
      value: finishedCount,
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'text-success-500',
      bg: 'bg-success-500/10',
    },
    {
      key: 'avgResponse',
      label: CARD_LABELS.avgResponse,
      value: avgResponseTime,
      icon: <Clock className="w-5 h-5" />,
      color: 'text-warning-400',
      bg: 'bg-warning-500/10',
    },
    {
      key: 'open',
      label: CARD_LABELS.open,
      value: triageCount || metrics?.openCount || 0,
      icon: <TicketIcon className="w-5 h-5" />,
      color: 'text-danger-400',
      bg: 'bg-danger-500/10',
    },
  ];

  const visibleMetricCards = metricCards.filter((m) => visibleCards[m.key]);

  const exportNpsCsv = () => {
    const headers = ['Cliente', 'Telefone', 'Nota', 'Protocolo', 'Atendente', 'Data'];
    const rows = npsRatings.map((r) => [
      `"${(r.contact.name ?? '').replace(/"/g, '""')}"`,
      `"${r.contact.phone ?? ''}"`,
      String(r.rating ?? ''),
      `"${r.ticket.protocolo}"`,
      `"${(r.ticket.assigneeName ?? '').replace(/"/g, '""')}"`,
      new Date(r.createdAt).toLocaleString('pt-BR'),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV(csv, 'avaliacoes_nps.csv');
  };

  const periodLabel =
    filterFrom && filterTo
      ? filterFrom === filterTo
        ? `Dia ${formatDayPt(filterFrom)}`
        : `${formatDayPt(filterFrom)} — ${formatDayPt(filterTo)}`
      : filterFrom
        ? `A partir de ${formatDayPt(filterFrom)}`
        : filterTo
          ? `Até ${formatDayPt(filterTo)}`
          : 'Todo o período';

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
          <div className="relative" ref={cardsMenuRef}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCardsMenuOpen((o) => !o)}
              title="Mostrar ou ocultar cards"
              aria-expanded={cardsMenuOpen}
            >
              <LayoutGrid className="w-4 h-4" />
              Cards
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${cardsMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {cardsMenuOpen && (
              <div className="absolute right-0 mt-1 z-30 w-64 rounded-lg border border-ink-700 bg-ink-900 shadow-xl p-2">
                <p className="text-xs text-ink-300 px-2 py-1.5">Cards visíveis</p>
                {(Object.keys(CARD_LABELS) as MetricCardKey[]).map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-ink-800 cursor-pointer text-sm text-ink-100"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-ink-600"
                      checked={visibleCards[key]}
                      onChange={() => toggleCardVisibility(key)}
                    />
                    {CARD_LABELS[key]}
                  </label>
                ))}
              </div>
            )}
          </div>
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
          <button onClick={exportTicketsCSV} className="btn-secondary">
            <Download className="w-4 h-4" />
            Exportar Tickets
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-white">Filtros</h3>
          <span className="text-xs text-ink-300 ml-auto">Gráfico, NPS e PDF</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs px-2.5 py-1" onClick={() => applyPreset('today')}>
            Hoje
          </button>
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

      {visibleMetricCards.length > 0 ? (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
            visibleMetricCards.length >= 4
              ? 'lg:grid-cols-4'
              : visibleMetricCards.length === 3
                ? 'lg:grid-cols-3'
                : 'lg:grid-cols-2'
          }`}
        >
          {visibleMetricCards.map((m) => (
            <div key={m.key} className="card p-5 hover:border-ink-600 transition-colors">
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
      ) : (
        <div className="card p-4 text-sm text-ink-300">
          Nenhum card visível. Use o menu <span className="text-ink-100">Cards</span> para exibir métricas.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-6 items-start">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-5 h-5 text-brand-400 shrink-0" />
              <h3 className="text-sm font-semibold text-white truncate">Atendimentos por usuário</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-300">
              <span className="truncate">{periodLabel}</span>
              <span className="shrink-0">
                {byAttendantTotal} atendimento{byAttendantTotal === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <p className="text-xs text-ink-300 mb-3 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            Clique na lupa para ver os atendimentos
          </p>

          {byAttendantError && <p className="text-sm text-danger-400 mb-3">{byAttendantError}</p>}

          {byAttendantLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : byAttendant.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-ink-300">
              <Users className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum atendente encontrado</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden pr-1">
              {byAttendant.map((row) => (
                <div key={row.assigneeId} className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-brand-500/40 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 hover:text-brand-300 shrink-0 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-brand-500/10"
                    title={
                      row.count > 0
                        ? `Ver atendimentos de ${row.name}`
                        : 'Sem atendimentos neste período'
                    }
                    disabled={row.count <= 0}
                    onClick={() => void openAttendantDetail(row)}
                    aria-label={`Ver atendimentos de ${row.name}`}
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <span
                    className="text-xs text-ink-100 w-20 sm:w-28 truncate shrink-0"
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  <div className="flex-1 h-7 bg-ink-800 rounded-md overflow-hidden min-w-0">
                    <div
                      className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-md transition-all duration-500 min-w-0"
                      style={{
                        width:
                          maxAttendantCount > 0
                            ? `${Math.max((row.count / maxAttendantCount) * 100, row.count > 0 ? 4 : 0)}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <span className="text-xs text-ink-200 w-7 text-right tabular-nums shrink-0">
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-warning-400" />
              <h3 className="text-sm font-semibold text-white">Avaliação de Atendimento (NPS)</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-300">{npsData.total} avaliações</span>
              <button
                type="button"
                className="btn-ghost text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
                onClick={() => setNpsListOpen(true)}
                title="Ver clientes que avaliaram"
              >
                <List className="w-3.5 h-3.5" />
                Clientes
              </button>
            </div>
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
      </div>

      {npsListOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setNpsListOpen(false)}
        >
          <div
            className="card w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-ink-700">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">Clientes que avaliaram</h3>
                <p className="text-xs text-ink-300 mt-0.5">
                  {periodLabel}
                  {filterRating ? ` · ${filterRating} estrela${filterRating === '1' ? '' : 's'}` : ''}
                  {filterUserId
                    ? ` · ${agents.find((a) => a.id === filterUserId)?.name ?? 'usuário'}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="btn-ghost p-1.5"
                  onClick={exportNpsCsv}
                  disabled={npsRatings.length === 0}
                  title="Exportar CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="btn-ghost p-1"
                  onClick={() => setNpsListOpen(false)}
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {npsRatingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              ) : npsRatingsError ? (
                <p className="text-sm text-danger-400">{npsRatingsError}</p>
              ) : npsRatings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-ink-300">
                  <Star className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma avaliação neste filtro</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {npsRatings.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="w-full flex items-center gap-3 p-3 rounded-lg bg-ink-800/60 hover:bg-ink-800 text-left transition-colors"
                      onClick={() => {
                        setNpsListOpen(false);
                        if (onOpenTicket) onOpenTicket(r.ticket.id);
                        else onNavigateToChat();
                      }}
                      title="Abrir ticket no chat"
                    >
                      <div className="w-9 h-9 rounded-full bg-ink-700 flex items-center justify-center text-xs font-semibold text-ink-100 shrink-0">
                        {r.contact.name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{r.contact.name}</p>
                        <p className="text-xs text-ink-300 truncate">
                          {r.contact.phone
                            ? formatPhone(r.contact.phone)
                            : r.contact.jid}
                          {r.ticket.protocolo ? ` · ${r.ticket.protocolo}` : ''}
                          {r.ticket.assigneeName ? ` · ${r.ticket.assigneeName}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex justify-end gap-0.5 mb-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3 h-3 ${
                                r.rating != null && s <= r.rating
                                  ? 'text-warning-400 fill-warning-400'
                                  : 'text-ink-600'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] text-ink-300">
                          {new Date(r.createdAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!npsRatingsLoading && npsRatings.length > 0 && (
              <div className="px-4 py-3 border-t border-ink-700 text-xs text-ink-300 flex items-center justify-between gap-2">
                <span>
                  {npsRatingsTotal} avaliação{npsRatingsTotal === 1 ? '' : 'ões'}
                  {npsRatings.length < npsRatingsTotal ? ` (mostrando ${npsRatings.length})` : ''}
                </span>
                <span>Clique para abrir no chat</span>
              </div>
            )}
          </div>
        </div>
      )}

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeAttendantDetail}
        >
          <div
            className="card w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-ink-700">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">
                  Atendimentos — {detailName}
                </h3>
                <p className="text-xs text-ink-300 mt-0.5">{periodLabel}</p>
              </div>
              <button
                type="button"
                className="btn-ghost p-1 shrink-0"
                onClick={closeAttendantDetail}
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              ) : detailError ? (
                <p className="text-sm text-danger-400">{detailError}</p>
              ) : detailTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-ink-300">
                  <TicketIcon className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">Nenhum atendimento neste período</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {detailTickets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full flex items-center gap-3 p-3 rounded-lg bg-ink-800/60 hover:bg-ink-800 text-left transition-colors"
                      onClick={() => {
                        closeAttendantDetail();
                        if (onOpenTicket) onOpenTicket(t.id);
                        else onNavigateToChat();
                      }}
                      title="Abrir no chat"
                    >
                      <div className="w-9 h-9 rounded-full bg-ink-700 flex items-center justify-center text-xs font-semibold text-ink-100 shrink-0">
                        {t.contact?.name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {t.contact?.name ?? 'Sem nome'}
                        </p>
                        <p className="text-xs text-ink-300 truncate">
                          {t.subject?.trim() ||
                            (t.contact?.phone
                              ? formatPhone(t.contact.phone)
                              : null) ||
                            t.id.slice(0, 8)}
                          {t.department ? ` · ${t.department}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-ink-300">
                          {t.finished_at
                            ? new Date(t.finished_at).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!detailLoading && detailTickets.length > 0 && (
              <div className="px-4 py-3 border-t border-ink-700 text-xs text-ink-300">
                {detailTickets.length} atendimento
                {detailTickets.length === 1 ? '' : 's'} · clique para abrir no chat
              </div>
            )}
          </div>
        </div>
      )}
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
