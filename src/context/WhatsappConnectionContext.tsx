import type { ReactNode } from 'react';
import { useWhatsappConnection as useWhatsappConnectionData } from '../hooks/useData';
import { WhatsappConnectionContext } from './whatsapp-connection-context';

export function WhatsappConnectionProvider({ children }: { children: ReactNode }) {
  const value = useWhatsappConnectionData();
  return (
    <WhatsappConnectionContext.Provider value={value}>
      {children}
    </WhatsappConnectionContext.Provider>
  );
}
