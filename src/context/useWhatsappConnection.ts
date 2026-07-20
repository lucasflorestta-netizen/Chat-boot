import { useContext } from 'react';
import { WhatsappConnectionContext } from './whatsapp-connection-context';

export function useWhatsappConnection() {
  const ctx = useContext(WhatsappConnectionContext);
  if (!ctx) {
    throw new Error('useWhatsappConnection must be used within WhatsappConnectionProvider');
  }
  return ctx;
}
