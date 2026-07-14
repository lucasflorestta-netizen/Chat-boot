export type UserRole = 'admin' | 'agent';
export type Department = 'admin' | 'support' | 'sales';
export type TicketStatus = 'triage' | 'attending' | 'finished';
export type MessageType = 'text' | 'image' | 'audio' | 'file' | 'video' | 'note' | 'sticker';
export type SenderType = 'client' | 'agent' | 'bot' | 'system';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  department: Department;
  max_concurrent_chats: number;
  work_start: string | null;
  work_end: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  whatsapp_lid: string | null;
  profile_pic_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  contact_id: string;
  status: TicketStatus;
  department: Department;
  assigned_to: string | null;
  subject: string | null;
  priority: Priority;
  unread_count: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  contact?: Contact;
  assigned_agent?: Profile | null;
  tags?: Tag[];
}

/** Client-only send state for optimistic UI (not stored in DB). */
export type LocalSendStatus = 'sending' | 'failed';

export interface Message {
  id: string;
  ticket_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  body: string | null;
  media_type: MessageType;
  media_url: string | null;
  media_name: string | null;
  is_deleted: boolean;
  original_body: string | null;
  whatsapp_delivered: boolean;
  whatsapp_message_id: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  sender?: Profile | null;
  /** Quoted message preview (joined via reply_to_message_id). */
  reply_to?: Message | null;
  /** Optimistic / failed local status — never comes from Supabase. */
  _localStatus?: LocalSendStatus;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface CannedResponse {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  created_at: string;
}

export interface ScheduledMessage {
  id: string;
  ticket_id: string;
  body: string;
  scheduled_for: string;
  sent: boolean;
  created_by: string | null;
  created_at: string;
}

export interface NpsRating {
  id: string;
  ticket_id: string;
  contact_id: string;
  rating: number | null;
  created_at: string;
}

export interface AutoMessageSettings {
  id: string;
  greeting_message: string;
  bot_menu_active: boolean;
  bot_menu_message: string;
  takeover_message: string;
  closing_message: string;
  nps_question: string;
  nps_active: boolean;
  updated_at: string;
}

export interface WhatsappConnection {
  id: string;
  status: 'connected' | 'disconnected' | 'syncing';
  qr_code: string | null;
  phone_number: string | null;
  last_connected_at: string | null;
  contacts_sync_requested_at: string | null;
  updated_at: string;
}

export const DEPARTMENT_LABELS: Record<Department, string> = {
  admin: 'Administrador',
  support: 'Suporte',
  sales: 'Comercial',
};

export const DEPARTMENT_COLORS: Record<Department, string> = {
  admin: '#8b5cf6',
  support: '#3b82f6',
  sales: '#10b981',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  triage: 'Triagem',
  attending: 'Em Atendimento',
  finished: 'Finalizados',
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  triage: '#f59e0b',
  attending: '#3b82f6',
  finished: '#6b7280',
};
