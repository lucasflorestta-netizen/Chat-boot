import type { AgentStatus } from '../types';

export const AGENT_STATUS_OPTIONS: { value: AgentStatus; label: string }[] = [
  { value: 'DISPONIVEL', label: 'Disponível' },
  { value: 'PAUSA', label: 'Pausa' },
  { value: 'OFFLINE', label: 'Offline' },
];

export function agentStatusLabel(status: AgentStatus): string {
  return AGENT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function agentStatusBadgeClass(status: AgentStatus): string {
  switch (status) {
    case 'DISPONIVEL':
      return 'bg-success-500/20 text-success-400';
    case 'PAUSA':
      return 'bg-warning-500/20 text-warning-400';
    case 'OFFLINE':
    default:
      return 'bg-ink-600 text-ink-200';
  }
}

/** Minutes before lunchStart when the API auto-sets OFFLINE. */
export const LUNCH_AUTO_OFFLINE_LEAD_MINUTES = 5;
