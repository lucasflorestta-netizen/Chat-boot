import { Loader2, UtensilsCrossed } from 'lucide-react';

interface LunchReturnModalProps {
  confirming: boolean;
  onConfirm: () => void;
}

/**
 * Bloqueia toda a UI até o agente confirmar o retorno
 * (fim do almoço / início do expediente).
 */
export function LunchReturnModal({
  confirming,
  onConfirm,
}: LunchReturnModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/95 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="lunch-return-title"
      aria-describedby="lunch-return-desc"
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.preventDefault();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-brand-500/30 bg-ink-900 p-6 shadow-2xl ring-1 ring-brand-500/20">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h2
              id="lunch-return-title"
              className="text-lg font-semibold text-white"
            >
              Confirme seu retorno
            </h2>
            <p
              id="lunch-return-desc"
              className="text-sm text-ink-300 leading-relaxed"
            >
              Seu horário de almoço ou intervalo terminou. Confirme que você
              voltou para liberar novos atendimentos. Enquanto não confirmar,
              nenhum chamado novo será atribuído a você.
            </p>
          </div>
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            autoFocus
            className="mt-1 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-ink-900"
          >
            {confirming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirmando…
              </>
            ) : (
              'Voltei — entrar em Disponível'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
