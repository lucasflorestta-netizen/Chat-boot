import { ArrowRightCircle, X } from 'lucide-react';
import type { Ticket } from '../../types';

interface TransferAcceptModalProps {
  ticket: Ticket;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onDismiss?: () => void;
}

export function TransferAcceptModal({
  ticket,
  busy,
  onAccept,
  onReject,
  onDismiss,
}: TransferAcceptModalProps) {
  const fromName =
    ticket.pending_transfer_from_agent?.name?.trim() ||
    'Um agente';
  const contactName = ticket.contact?.name?.trim() || 'Cliente';

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
        <p className="text-sm text-ink-200 mb-4 leading-relaxed">
          <span className="text-white font-medium">{fromName}</span> quer
          transferir a conversa de{' '}
          <span className="text-white font-medium">{contactName}</span> para
          você. Aceitar?
        </p>
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
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
