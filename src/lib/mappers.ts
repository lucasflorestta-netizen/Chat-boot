import { mediaUrl } from './api';
import type {
  AgentStatus,
  AppearanceSettings,
  AutoMessageSettings,
  CannedResponse,
  Contact,
  Department,
  Message,
  MessageType,
  Priority,
  Profile,
  ScheduledMessage,
  SenderType,
  Tag,
  Ticket,
  TicketStatus,
  UserRole,
  WhatsappConnection,
} from '../types';

function iso(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function isoOrNull(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return iso(value);
}

export function mapRole(role: string | undefined | null): UserRole {
  if (role === 'ADMIN' || role === 'SUPERVISOR' || role === 'admin' || role === 'supervisor') {
    return 'admin';
  }
  return 'agent';
}

export function mapSectorToDepartment(name?: string | null): Department {
  if (!name) return 'support';
  const n = name.toLowerCase();
  if (n.includes('admin')) return 'admin';
  if (n.includes('comercial') || n.includes('sales') || n.includes('venda')) return 'sales';
  if (n.includes('suporte') || n.includes('support')) return 'support';
  return name as Department;
}

export function mapTicketStatus(status: string | undefined | null): TicketStatus {
  switch (status) {
    case 'EM_ATENDIMENTO':
    case 'attending':
      return 'attending';
    case 'FECHADO':
    case 'finished':
      return 'finished';
    case 'EM_TRIAGEM':
    case 'AGUARDANDO':
    case 'triage':
    default:
      return 'triage';
  }
}

export function mapPriority(priority: string | undefined | null): Priority {
  const p = (priority || 'NORMAL').toLowerCase();
  if (p === 'low' || p === 'high' || p === 'urgent' || p === 'normal') return p;
  return 'normal';
}

export function mapSender(sender: string | undefined | null): SenderType {
  switch (sender) {
    case 'CONTATO':
    case 'client':
      return 'client';
    case 'FUNCIONARIO':
    case 'agent':
      return 'agent';
    case 'BOT':
    case 'bot':
      return 'bot';
    case 'SYSTEM':
    case 'system':
    default:
      return 'system';
  }
}

export function mapMediaType(mediaType: string | undefined | null): MessageType {
  const m = (mediaType || 'TEXT').toLowerCase();
  if (
    m === 'text' ||
    m === 'image' ||
    m === 'audio' ||
    m === 'file' ||
    m === 'video' ||
    m === 'note' ||
    m === 'sticker'
  ) {
    return m;
  }
  return 'text';
}

export function toApiMediaType(mediaType: MessageType | string): string {
  return mediaType.toUpperCase();
}

export function mapAgentStatus(raw: unknown): AgentStatus {
  if (raw === 'PAUSA' || raw === 'OFFLINE' || raw === 'DISPONIVEL') return raw;
  return 'OFFLINE';
}

export function mapProfile(raw: any): Profile {
  const sectorName = raw?.sector?.name ?? null;
  return {
    id: raw.id,
    name: raw.name || raw.username || 'Usuário',
    username: raw.username || '',
    email: raw.email ?? null,
    role: mapRole(raw.role),
    apiRole: String(raw.role ?? 'OPERATOR'),
    department: mapSectorToDepartment(sectorName),
    sectorId: raw.sectorId ?? raw.sector?.id ?? null,
    max_concurrent_chats: raw.limiteSimultaneo ?? raw.max_concurrent_chats ?? 3,
    work_start: raw.workStart ?? raw.work_start ?? null,
    work_end: raw.workEnd ?? raw.work_end ?? null,
    lunch_start: raw.lunchStart ?? raw.lunch_start ?? null,
    lunch_end: raw.lunchEnd ?? raw.lunch_end ?? null,
    status: mapAgentStatus(raw.status),
    avatar_url: mediaUrl(raw.avatarUrl ?? raw.avatar_url),
    is_active: raw.isActive ?? raw.is_active ?? true,
    created_at: iso(raw.createdAt ?? raw.created_at),
  };
}

export function mapAppearanceSettings(raw: any): AppearanceSettings {
  return {
    id: raw.id,
    wallpaperKey: raw.wallpaperKey ?? raw.wallpaper_key ?? 'linen',
    customImageUrl: raw.customImageUrl ?? raw.custom_image_url ?? null,
    updatedAt: iso(raw.updatedAt ?? raw.updated_at),
  };
}

export function mapContact(raw: any): Contact {
  return {
    id: raw.id,
    name: raw.displayName || raw.name || raw.phone || raw.jid || 'Contato',
    phone: raw.phone || raw.jid?.split('@')[0] || '',
    whatsapp_lid: raw.whatsappLid ?? raw.whatsapp_lid ?? null,
    profile_pic_url: mediaUrl(
      raw.profilePicUrl ?? raw.profile_pic_url ?? raw.photo ?? null,
    ),
    notes: raw.notes ?? null,
    wa_conversation_at: isoOrNull(
      raw.waConversationAt ?? raw.wa_conversation_at,
    ),
    wa_archived: !!(raw.waArchived ?? raw.wa_archived),
    created_at: iso(raw.createdAt ?? raw.created_at),
    updated_at: iso(raw.updatedAt ?? raw.updated_at),
  };
}

export function mapTag(raw: any): Tag {
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color || '#3b82f6',
    created_at: iso(raw.createdAt ?? raw.created_at),
  };
}

function pickLatestMessage(messages: any[] | undefined | null) {
  if (!messages?.length) return null;
  return messages.reduce((best, m) => {
    const t = new Date(m.createdAt ?? m.created_at ?? 0).getTime();
    const bt = new Date(best.createdAt ?? best.created_at ?? 0).getTime();
    return t >= bt ? m : best;
  });
}

function mapTicketLastMessage(raw: any): Ticket['last_message'] {
  if (!raw) return null;
  return {
    id: raw.id,
    body: raw.body ?? null,
    media_type: mapMediaType(raw.mediaType ?? raw.media_type),
    sender_type: mapSender(raw.sender ?? raw.sender_type),
    created_at: iso(raw.createdAt ?? raw.created_at),
    deleted_by_client:
      raw.deletedByClient ?? raw.deleted_by_client ?? false,
    deleted_for_client:
      raw.deletedForClient ?? raw.deleted_for_client ?? false,
  };
}

export function mapTicket(raw: any): Ticket {
  const tags = (raw.tags || [])
    .map((tt: any) => (tt?.tag ? mapTag(tt.tag) : tt?.id ? mapTag(tt) : null))
    .filter(Boolean) as Tag[];

  const lastMessage =
    mapTicketLastMessage(
      raw.last_message ?? raw.lastMessage ?? pickLatestMessage(raw.messages),
    ) ?? null;

  return {
    id: raw.id,
    contact_id: raw.contactId ?? raw.contact_id,
    status: mapTicketStatus(raw.status),
    department: mapSectorToDepartment(raw.sector?.name),
    sectorId: raw.sectorId ?? raw.sector?.id ?? null,
    assigned_to: raw.assigneeId ?? raw.assigned_to ?? null,
    subject: raw.subject ?? null,
    priority: mapPriority(raw.priority),
    unread_count: raw.unreadCount ?? raw.unread_count ?? 0,
    last_message_at: iso(raw.lastMessageAt ?? raw.last_message_at),
    created_at: iso(raw.createdAt ?? raw.created_at),
    updated_at: iso(raw.updatedAt ?? raw.updated_at),
    finished_at: isoOrNull(raw.finishedAt ?? raw.finished_at),
    contact: raw.contact ? mapContact(raw.contact) : undefined,
    assigned_agent: raw.assignee
      ? mapProfile(raw.assignee)
      : raw.assigned_agent
        ? mapProfile(raw.assigned_agent)
        : null,
    tags,
    last_message: lastMessage,
    pending_transfer_to:
      raw.pendingTransferToId ?? raw.pending_transfer_to ?? null,
    pending_transfer_from:
      raw.pendingTransferFromId ?? raw.pending_transfer_from ?? null,
    pending_transfer_at: isoOrNull(
      raw.pendingTransferAt ?? raw.pending_transfer_at,
    ),
    pending_transfer_to_agent: raw.pendingTransferTo
      ? mapProfile(raw.pendingTransferTo)
      : raw.pending_transfer_to_agent
        ? mapProfile(raw.pending_transfer_to_agent)
        : null,
    pending_transfer_from_agent: raw.pendingTransferFrom
      ? mapProfile(raw.pendingTransferFrom)
      : raw.pending_transfer_from_agent
        ? mapProfile(raw.pending_transfer_from_agent)
        : null,
  };
}

export function mapMessage(raw: any): Message {
  return {
    id: raw.id,
    ticket_id: raw.ticketId ?? raw.ticket_id,
    sender_type: mapSender(raw.sender ?? raw.sender_type),
    sender_id: raw.senderId ?? raw.sender_id ?? null,
    body: raw.body ?? null,
    media_type: mapMediaType(raw.mediaType ?? raw.media_type),
    media_url: mediaUrl(raw.mediaUrl ?? raw.media_url),
    media_name: raw.mediaName ?? raw.media_name ?? null,
    is_deleted:
      raw.deletedByClient ??
      raw.deleted_by_client ??
      raw.isDeleted ??
      raw.is_deleted ??
      false,
    deleted_by_client:
      raw.deletedByClient ??
      raw.deleted_by_client ??
      raw.isDeleted ??
      raw.is_deleted ??
      false,
    deleted_for_client:
      raw.deletedForClient ?? raw.deleted_for_client ?? false,
    is_edited: raw.isEdited ?? raw.is_edited ?? false,
    original_body: raw.originalBody ?? raw.original_body ?? null,
    whatsapp_delivered: raw.whatsappDelivered ?? raw.whatsapp_delivered ?? false,
    whatsapp_message_id: raw.whatsappMessageId ?? raw.whatsapp_message_id ?? null,
    reply_to_message_id: raw.replyToId ?? raw.reply_to_message_id ?? null,
    created_at: iso(raw.createdAt ?? raw.created_at),
    sender: raw.senderUser
      ? mapProfile(raw.senderUser)
      : raw.senderProfile
        ? mapProfile(raw.senderProfile)
        : null,
    reply_to: raw.replyTo
      ? mapMessage(raw.replyTo)
      : raw.reply_to
        ? mapMessage(raw.reply_to)
        : null,
  };
}

export function mapCanned(raw: any): CannedResponse {
  return {
    id: raw.id,
    shortcut: raw.shortcut,
    title: raw.title || raw.shortcut,
    body: raw.content ?? raw.body ?? '',
    created_at: iso(raw.createdAt ?? raw.created_at),
  };
}

export function mapAutoSettings(raw: any): AutoMessageSettings {
  return {
    id: raw.id,
    greeting_message: raw.greetingMessage ?? raw.greeting_message ?? '',
    bot_menu_active: raw.botMenuActive ?? raw.bot_menu_active ?? true,
    bot_menu_message: raw.botMenuMessage ?? raw.bot_menu_message ?? '',
    takeover_message: raw.takeoverMessage ?? raw.takeover_message ?? '',
    closing_message: raw.closingMessage ?? raw.closing_message ?? '',
    nps_question: raw.npsQuestion ?? raw.nps_question ?? '',
    nps_active: raw.npsActive ?? raw.nps_active ?? true,
    after_hours_message: raw.afterHoursMessage ?? raw.after_hours_message ?? '',
    business_hours_enabled:
      raw.businessHoursEnabled ?? raw.business_hours_enabled ?? false,
    business_hours_start:
      raw.businessHoursStart ?? raw.business_hours_start ?? '08:00',
    business_hours_end:
      raw.businessHoursEnd ?? raw.business_hours_end ?? '18:00',
    operator_lunch_auto_status:
      raw.operatorLunchAutoStatus ?? raw.operator_lunch_auto_status ?? true,
    inactivity_enabled:
      raw.inactivityEnabled ?? raw.inactivity_enabled ?? true,
    inactivity_warning_message:
      raw.inactivityWarningMessage ??
      raw.inactivity_warning_message ??
      'Ainda está aí? Não tivemos retorno, em breve o atendimento será encerrado.',
    inactivity_warning_minutes: Number(
      raw.inactivityWarningMinutes ?? raw.inactivity_warning_minutes ?? 13,
    ),
    inactivity_closing_message:
      raw.inactivityClosingMessage ??
      raw.inactivity_closing_message ??
      'Encerramos seu atendimento por inatividade. Obrigado!',
    inactivity_closing_minutes: Number(
      raw.inactivityClosingMinutes ?? raw.inactivity_closing_minutes ?? 15,
    ),
    satisfaction_form_url:
      raw.satisfactionFormUrl ?? raw.satisfaction_form_url ?? '',
    updated_at: iso(raw.updatedAt ?? raw.updated_at),
  };
}

export function mapScheduled(raw: any): ScheduledMessage {
  return {
    id: raw.id,
    ticket_id: raw.ticketId ?? raw.ticket_id,
    body: raw.body,
    scheduled_for: iso(raw.scheduledFor ?? raw.scheduled_for),
    sent: raw.sent ?? false,
    created_by: raw.createdById ?? raw.created_by ?? null,
    created_at: iso(raw.createdAt ?? raw.created_at),
  };
}

export function mapWhatsappStatus(raw: any): WhatsappConnection {
  return {
    id: 'wa',
    status: raw?.status === 'connected' || raw?.status === 'syncing' || raw?.status === 'disconnected'
      ? raw.status
      : raw?.connected
        ? 'connected'
        : raw?.hasQr || raw?.qr
          ? 'syncing'
          : 'disconnected',
    qr_code: raw?.qr ?? raw?.qr_code ?? null,
    phone_number: raw?.phoneNumber ?? raw?.phone_number ?? null,
    last_connected_at: isoOrNull(raw?.lastConnectedAt ?? raw?.last_connected_at),
    contacts_sync_requested_at: null,
    updated_at: new Date().toISOString(),
  };
}

export function departmentLabel(dept: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrador',
    support: 'Suporte',
    sales: 'Comercial',
  };
  return labels[dept] ?? dept;
}
