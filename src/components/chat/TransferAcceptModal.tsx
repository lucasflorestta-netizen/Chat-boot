import { ArrowRightCircle, AlertTriangle, X } from 'lucide-react';
import type { Ticket } from '../../types';

interface TransferAcceptModalProps {
  ticket: Ticket;
  busy?: boolean;
  /** Destino já está no limite (ou acima) de atendimentos simultâneos. */
  queueFull?: boolean;
  activeCount?: number;
  maxConcurrent?: number;
  onAccept: () => void;
  onReject: () => void;
  onDismiss?: () => void;
}

export function TransferAcceptModal({
  ticket,
  busy,
  queueFull,
  activeCount,
  maxConcurrent,
  onAccept,
  onReject,
  onDismiss,
}: TransferAcceptModalProps) {
  const fromName =
    ticket.pending_transfer_from_agent?.name?.trim() ||
    'Um agente';
  const contactName = ticket.contact?.name?.trim() || 'Cliente';
  const protocolo = ticket.protocolo?.trim() || null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] animate-fade-in">
      <div className="card p-5 w-[22rem] shadow-2xl border border-brand-500/40">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <ArrowRightCircle className="w-5 h-5 text-brand-400 flex-shrink-0" />
            <h3 className="text-sm font-semibold text-white">
              Transferência de atendimento
            </h3>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="btn-ghost p-1"
              disabled={busy}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-ink-200 mb-3 leading-relaxed">
          <span className="text-white font-medium">{fromName}</span> quer
          transferir a conversa de{' '}
          <span className="text-white font-medium">{contactName}</span>
          {protocolo ? (
            <>
              {' '}
              <span className="text-ink-400">({protocolo})</span>
            </>
          ) : null}{' '}
          para você. Aceitar?
        </p>
        {queueFull && (
          <div className="mb-4 flex gap-2 rounded-lg border border-warning-500/40 bg-warning-500/10 px-3 py-2 text-xs text-warning-200 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-warning-400 flex-shrink-0 mt-0.5" />
            <p>
              Sua fila está cheia
              {typeof activeCount === 'number' &&
              typeof maxConcurrent === 'number'
                ? ` (${activeCount}/${maxConcurrent})`
                : ''}
              . Ao aceitar, você assume este atendimento mesmo assim.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-ink-700 hover:bg-ink-600 text-ink-100 disabled:opacity-50"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
          >
            {queueFull ? 'Aceitar mesmo assim' : 'Aceitar'}
          </button>
        </div>
      </div>
    </div>
  );
}
