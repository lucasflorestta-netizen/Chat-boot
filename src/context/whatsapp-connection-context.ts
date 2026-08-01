import { createContext } from 'react';
import type { WhatsappConnection } from '../types';

export interface WhatsappConnectionContextValue {
  connection: WhatsappConnection | null;
  loading: boolean;
  refetch: () => Promise<void>;
  /** Força UI/status syncing imediatamente após "Gerar QR" (antes do poll/socket). */
  markSyncing: () => void;
}

export const WhatsappConnectionContext = createContext<
  WhatsappConnectionContextValue | undefined
>(undefined);
