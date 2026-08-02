/**
 * Notificações do Mural (atribuição + lembrete no dueAt).
 * Vive fora do React para timers não morrerem no re-render do App.
 */

export type MuralReminderPayload = {
  taskId: string;
  ticketId?: string | null;
  body?: string | null;
  contactName?: string | null;
  avatarUrl?: string | null;
  title?: string;
  dueAt?: string | Date | null;
};

type ReminderHandler = (payload: MuralReminderPayload) => void;

const timers = new Map<string, number>();
/** Dedupe separado: atribuição vs lembrete na data. */
const firedAssigned = new Set<string>();
const firedDue = new Set<string>();
let handler: ReminderHandler | null = null;

export function setMuralReminderHandler(next: ReminderHandler | null) {
  handler = next;
}

function deliver(payload: MuralReminderPayload) {
  const run = () => handler?.(payload);
  if (handler) {
    run();
    return;
  }
  window.setTimeout(run, 300);
}

export function clearMuralReminder(taskId: string) {
  const t = timers.get(taskId);
  if (t != null) {
    window.clearTimeout(t);
    timers.delete(taskId);
  }
}

/** Toast imediato ao criar/atribuir tarefa (self ou outro). */
export function notifyMuralAssigned(payload: MuralReminderPayload) {
  const id = payload.taskId?.trim();
  if (!id) return;
  if (firedAssigned.has(id)) return;
  firedAssigned.add(id);
  deliver({
    ...payload,
    title: payload.title ?? 'Nova tarefa no Mural',
  });
}

/** Toast do lembrete no horário (dueAt) — dedupe independente da atribuição. */
export function fireMuralReminder(payload: MuralReminderPayload) {
  const id = payload.taskId?.trim();
  if (!id) return;
  if (firedDue.has(id)) return;
  firedDue.add(id);
  clearMuralReminder(id);
  deliver({
    ...payload,
    title: payload.title ?? 'Lembrete do Mural',
  });
}

/** Agenda toast local para o dueAt (backup do cron). */
export function scheduleMuralReminder(
  payload: MuralReminderPayload & { dueAt: string | Date },
) {
  const id = payload.taskId?.trim();
  if (!id) return;
  if (firedDue.has(id)) return;

  clearMuralReminder(id);

  const dueMs = new Date(payload.dueAt).getTime();
  if (Number.isNaN(dueMs)) return;

  const delay = Math.max(0, dueMs - Date.now());
  if (delay > 24 * 60 * 60 * 1000) return;

  const timer = window.setTimeout(() => {
    timers.delete(id);
    fireMuralReminder({
      taskId: id,
      ticketId: payload.ticketId,
      body: payload.body,
      contactName: payload.contactName,
      avatarUrl: payload.avatarUrl,
      title: payload.title ?? 'Lembrete do Mural',
      dueAt: payload.dueAt,
    });
  }, delay);

  timers.set(id, timer);
}
