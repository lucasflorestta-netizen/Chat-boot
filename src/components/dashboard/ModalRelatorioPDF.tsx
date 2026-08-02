import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { apiBlob } from '../../lib/api';

export type ColunaRelatorioAvaliacao =
  | 'cliente_nome'
  | 'cliente_telefone'
  | 'avaliacao_nota'
  | 'atendente_nome'
  | 'data_avaliacao'
  | 'ticket_id'
  | 'comentario';

const COLUNAS: { key: ColunaRelatorioAvaliacao; label: string }[] = [
  { key: 'cliente_nome', label: 'cliente_nome' },
  { key: 'cliente_telefone', label: 'cliente_telefone' },
  { key: 'avaliacao_nota', label: 'avaliacao_nota' },
  { key: 'atendente_nome', label: 'atendente_nome' },
  { key: 'data_avaliacao', label: 'data_avaliacao' },
  { key: 'ticket_id', label: 'ticket_id' },
  { key: 'comentario', label: 'comentario' },
];

const DEFAULT_SELECTED: ColunaRelatorioAvaliacao[] = [
  'cliente_nome',
  'cliente_telefone',
  'avaliacao_nota',
  'atendente_nome',
];

export type ModalRelatorioPDFFilters = {
  de: string;
  ate: string;
  usuario_id: string;
  nota: string;
  usuarioNome?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  filters: ModalRelatorioPDFFilters;
};

function formatDayPt(isoDay: string): string {
  if (!isoDay) return '—';
  return isoDay.split('-').reverse().join('/');
}

export function ModalRelatorioPDF({ open, onClose, filters }: Props) {
  const [selected, setSelected] = useState<ColunaRelatorioAvaliacao[]>(DEFAULT_SELECTED);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected([...DEFAULT_SELECTED]);
    setError(null);
    setGenerating(false);
  }, [open]);

  const filtrosResumo = useMemo(() => {
    const parts: string[] = [];
    if (filters.de || filters.ate) {
      if (filters.de && filters.ate) {
        parts.push(
          filters.de === filters.ate
            ? `Data ${formatDayPt(filters.de)}`
            : `${formatDayPt(filters.de)} — ${formatDayPt(filters.ate)}`,
        );
      } else if (filters.de) {
        parts.push(`A partir de ${formatDayPt(filters.de)}`);
      } else {
        parts.push(`Até ${formatDayPt(filters.ate)}`);
      }
    } else {
      parts.push('Todo período');
    }
    if (filters.usuarioNome) parts.push(filters.usuarioNome);
    else if (filters.usuario_id) parts.push('Usuário filtrado');
    if (filters.nota) {
      parts.push(`${filters.nota} estrela${filters.nota === '1' ? '' : 's'}`);
    }
    return parts.join(' · ');
  }, [filters]);

  if (!open) return null;

  const toggleColumn = (key: ColunaRelatorioAvaliacao) => {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((c) => c !== key);
      return [...prev, key];
    });
  };

  const handleGenerate = async () => {
    if (selected.length === 0) {
      setError('Selecione ao menos uma coluna.');
      return;
    }
    if (filters.de && filters.ate && filters.de > filters.ate) {
      setError('A data inicial não pode ser maior que a final.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const body: Record<string, unknown> = {
        colunas_selecionadas: selected,
      };
      if (filters.de) body.de = filters.de;
      if (filters.ate) body.ate = filters.ate;
      if (filters.usuario_id) body.usuario_id = filters.usuario_id;
      if (filters.nota) body.nota = Number(filters.nota);

      const blob = await apiBlob('/relatorios/gerar-pdf-avaliacoes', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const day = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-avaliacoes-${day}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-relatorio-pdf-title"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-ink-700">
          <div className="min-w-0">
            <h3
              id="modal-relatorio-pdf-title"
              className="text-sm font-semibold text-white flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-brand-400" />
              Gerar Relatório PDF
            </h3>
            <p className="text-xs text-ink-300 mt-0.5">
              Selecione as colunas do relatório de avaliações
            </p>
            <p className="text-xs text-ink-400 mt-1 truncate" title={filtrosResumo}>
              Filtros: {filtrosResumo}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost p-1"
            onClick={onClose}
            title="Fechar"
            disabled={generating}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {COLUNAS.map((col) => {
            const checked = selected.includes(col.key);
            const order = checked ? selected.indexOf(col.key) + 1 : null;
            return (
              <label
                key={col.key}
                className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-ink-800 cursor-pointer text-sm text-ink-100"
              >
                <input
                  type="checkbox"
                  className="rounded border-ink-600"
                  checked={checked}
                  onChange={() => toggleColumn(col.key)}
                  disabled={generating}
                />
                <span className="font-mono text-xs sm:text-sm">{col.label}</span>
                {order != null && (
                  <span className="ml-auto text-[10px] text-ink-400 tabular-nums">
                    #{order}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {error && (
          <p className="px-4 pb-2 text-sm text-danger-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 p-4 border-t border-ink-700">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={generating}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleGenerate()}
            disabled={generating || selected.length === 0}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Gerar
          </button>
        </div>
      </div>
    </div>
  );
}
