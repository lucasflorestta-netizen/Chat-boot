import { createContext } from 'react';
import type { WhatsappConnection } from '../types';

export interface WhatsappConnectionContextValue {
  connection: WhatsappConnection | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export const WhatsappConnectionContext = createContext<
  WhatsappConnectionContextValue | undefined
>(undefined);
