import type { LocalSendStatus } from '../../types';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';

interface MessageStatusProps {
  localStatus?: LocalSendStatus;
  whatsappDelivered: boolean;
}

/** Agent message ticks: sending → sent → delivered. */
export function MessageStatus({ localStatus, whatsappDelivered }: MessageStatusProps) {
  if (localStatus === 'sending') {
    return <Clock className="w-3 h-3 text-white/50" aria-label="Enviando" />;
  }
  if (localStatus === 'failed') {
    return <AlertCircle className="w-3 h-3 text-danger-400" aria-label="Falha no envio" />;
  }
  if (whatsappDelivered) {
    return <CheckCheck className="w-3.5 h-3.5 text-sky-300" aria-label="Entregue" />;
  }
  return <Check className="w-3 h-3 text-white/50" aria-label="Enviado" />;
}
