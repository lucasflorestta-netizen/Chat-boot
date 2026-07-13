/*
# Helpdesk/CRM WhatsApp - Complete Database Schema

## Overview
Creates the full schema for a WhatsApp-integrated Helpdesk/CRM system with:
- User profiles (agents/admins) with departments, chat limits, and work hours
- Contacts synced from WhatsApp
- Tickets (conversations) with status tracking and department routing
- Messages supporting text, files, audio, images, internal notes, and deletion tracking
- Tags for ticket organization
- Canned/quick responses
- Scheduled messages
- NPS satisfaction ratings
- Auto-message settings (greeting, takeover, closing, NPS question, bot menu toggle)
- WhatsApp connection state

## Tables

1. **profiles** - Extends auth.users with helpdesk-specific fields (role, department, chat limits, work hours)
2. **contacts** - WhatsApp contacts (name, phone, profile pic)
3. **tickets** - Conversation tickets with status (triage/attending/finished), department, assignment
4. **messages** - Chat messages with media support and deletion tracking
5. **tags** - Colored labels for ticket organization
6. **ticket_tags** - Many-to-many between tickets and tags
7. **canned_responses** - Quick reply templates with shortcut commands
8. **scheduled_messages** - Messages scheduled for future sending
9. **nps_ratings** - Customer satisfaction scores (1-5) per ticket
10. **auto_message_settings** - Singleton config for automated messages
11. **whatsapp_connection** - Singleton tracking WhatsApp QR/auth state

## Security
- RLS enabled on all tables
- All authenticated agents can access shared helpdesk data (contacts, tickets, messages, tags, etc.)
- Profile management (create/update/delete other users) restricted to admins
- Users can update their own profile
- A trigger auto-creates a profile when a new auth user signs up; the first user becomes admin automatically

## Important Notes
1. The first user to sign up automatically receives the 'admin' role
2. Subsequent users get 'agent' role by default (admin can promote via user management)
3. All helpdesk data (tickets, contacts, messages) is shared among authenticated agents
4. The auto-creation trigger is SECURITY DEFINER to bypass RLS during signup
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New User',
  email text,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  department text NOT NULL DEFAULT 'support' CHECK (department IN ('admin', 'support', 'sales')),
  max_concurrent_chats integer NOT NULL DEFAULT 5,
  work_start time DEFAULT '09:00',
  work_end time DEFAULT '18:00',
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Trigger: auto-create profile on signup, first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first boolean;
BEGIN
  SELECT COUNT(*) = 0 INTO is_first FROM public.profiles;
  INSERT INTO public.profiles (id, name, email, role, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    NEW.email,
    CASE WHEN is_first THEN 'admin' ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'agent') END,
    COALESCE(NEW.raw_user_meta_data->>'department', 'support')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- CONTACTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Unknown',
  phone text NOT NULL UNIQUE,
  profile_pic_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_auth" ON public.contacts;
CREATE POLICY "contacts_select_auth" ON public.contacts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "contacts_insert_auth" ON public.contacts;
CREATE POLICY "contacts_insert_auth" ON public.contacts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "contacts_update_auth" ON public.contacts;
CREATE POLICY "contacts_update_auth" ON public.contacts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "contacts_delete_auth" ON public.contacts;
CREATE POLICY "contacts_delete_auth" ON public.contacts FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- TICKETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'triage' CHECK (status IN ('triage', 'attending', 'finished')),
  department text NOT NULL DEFAULT 'support' CHECK (department IN ('admin', 'support', 'sales')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject text,
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  unread_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_department ON public.tickets(department);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_contact ON public.tickets(contact_id);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_select_auth" ON public.tickets;
CREATE POLICY "tickets_select_auth" ON public.tickets FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "tickets_insert_auth" ON public.tickets;
CREATE POLICY "tickets_insert_auth" ON public.tickets FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tickets_update_auth" ON public.tickets;
CREATE POLICY "tickets_update_auth" ON public.tickets FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tickets_delete_auth" ON public.tickets;
CREATE POLICY "tickets_delete_auth" ON public.tickets FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('client', 'agent', 'bot', 'system')),
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text,
  media_type text DEFAULT 'text' CHECK (media_type IN ('text', 'image', 'audio', 'file', 'video', 'note', 'sticker')),
  media_url text,
  media_name text,
  is_deleted boolean DEFAULT false,
  original_body text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON public.messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_auth" ON public.messages;
CREATE POLICY "messages_select_auth" ON public.messages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "messages_insert_auth" ON public.messages;
CREATE POLICY "messages_insert_auth" ON public.messages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "messages_update_auth" ON public.messages;
CREATE POLICY "messages_update_auth" ON public.messages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "messages_delete_auth" ON public.messages;
CREATE POLICY "messages_delete_auth" ON public.messages FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- TAGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_select_auth" ON public.tags;
CREATE POLICY "tags_select_auth" ON public.tags FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "tags_insert_auth" ON public.tags;
CREATE POLICY "tags_insert_auth" ON public.tags FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tags_update_auth" ON public.tags;
CREATE POLICY "tags_update_auth" ON public.tags FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tags_delete_auth" ON public.tags;
CREATE POLICY "tags_delete_auth" ON public.tags FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- TICKET_TAGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_tags (
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, tag_id)
);

ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_tags_select_auth" ON public.ticket_tags;
CREATE POLICY "ticket_tags_select_auth" ON public.ticket_tags FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ticket_tags_insert_auth" ON public.ticket_tags;
CREATE POLICY "ticket_tags_insert_auth" ON public.ticket_tags FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ticket_tags_delete_auth" ON public.ticket_tags;
CREATE POLICY "ticket_tags_delete_auth" ON public.ticket_tags FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- CANNED_RESPONSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.canned_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcut text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canned_select_auth" ON public.canned_responses;
CREATE POLICY "canned_select_auth" ON public.canned_responses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "canned_insert_auth" ON public.canned_responses;
CREATE POLICY "canned_insert_auth" ON public.canned_responses FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "canned_update_auth" ON public.canned_responses;
CREATE POLICY "canned_update_auth" ON public.canned_responses FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "canned_delete_auth" ON public.canned_responses;
CREATE POLICY "canned_delete_auth" ON public.canned_responses FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- SCHEDULED_MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent boolean DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_for ON public.scheduled_messages(scheduled_for);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_select_auth" ON public.scheduled_messages;
CREATE POLICY "scheduled_select_auth" ON public.scheduled_messages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "scheduled_insert_auth" ON public.scheduled_messages;
CREATE POLICY "scheduled_insert_auth" ON public.scheduled_messages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "scheduled_update_auth" ON public.scheduled_messages;
CREATE POLICY "scheduled_update_auth" ON public.scheduled_messages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scheduled_delete_auth" ON public.scheduled_messages;
CREATE POLICY "scheduled_delete_auth" ON public.scheduled_messages FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- NPS_RATINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nps_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_ticket ON public.nps_ratings(ticket_id);

ALTER TABLE public.nps_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_select_auth" ON public.nps_ratings;
CREATE POLICY "nps_select_auth" ON public.nps_ratings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "nps_insert_auth" ON public.nps_ratings;
CREATE POLICY "nps_insert_auth" ON public.nps_ratings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "nps_update_auth" ON public.nps_ratings;
CREATE POLICY "nps_update_auth" ON public.nps_ratings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "nps_delete_auth" ON public.nps_ratings;
CREATE POLICY "nps_delete_auth" ON public.nps_ratings FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- AUTO_MESSAGE_SETTINGS TABLE (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.auto_message_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  greeting_message text DEFAULT 'Olá! Bem-vindo ao nosso atendimento. Como podemos ajudar?',
  bot_menu_active boolean DEFAULT true,
  bot_menu_message text DEFAULT 'Digite o número do setor desejado:\n1 - Suporte\n2 - Vendas',
  takeover_message text DEFAULT 'Olá! Sou {{agente}} e vou continuar seu atendimento. Em que posso ajudar?',
  closing_message text DEFAULT 'Seu atendimento foi finalizado. Obrigado pelo contato!',
  nps_question text DEFAULT 'Como você avalia nosso atendimento hoje? Digite de 1 a 5.',
  nps_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.auto_message_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_settings_select_auth" ON public.auto_message_settings;
CREATE POLICY "auto_settings_select_auth" ON public.auto_message_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auto_settings_insert_auth" ON public.auto_message_settings;
CREATE POLICY "auto_settings_insert_auth" ON public.auto_message_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auto_settings_update_auth" ON public.auto_message_settings;
CREATE POLICY "auto_settings_update_auth" ON public.auto_message_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Insert default settings row if none exists
INSERT INTO public.auto_message_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.auto_message_settings);

-- ============================================================
-- WHATSAPP_CONNECTION TABLE (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'syncing')),
  qr_code text,
  phone_number text,
  last_connected_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_connection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_conn_select_auth" ON public.whatsapp_connection;
CREATE POLICY "wa_conn_select_auth" ON public.whatsapp_connection FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "wa_conn_insert_auth" ON public.whatsapp_connection;
CREATE POLICY "wa_conn_insert_auth" ON public.whatsapp_connection FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "wa_conn_update_auth" ON public.whatsapp_connection;
CREATE POLICY "wa_conn_update_auth" ON public.whatsapp_connection FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Insert default connection row
INSERT INTO public.whatsapp_connection (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_connection);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_updated_at ON public.tickets;
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS contacts_updated_at ON public.contacts;
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS auto_settings_updated_at ON public.auto_message_settings;
CREATE TRIGGER auto_settings_updated_at BEFORE UPDATE ON public.auto_message_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS wa_conn_updated_at ON public.whatsapp_connection;
CREATE TRIGGER wa_conn_updated_at BEFORE UPDATE ON public.whatsapp_connection
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();