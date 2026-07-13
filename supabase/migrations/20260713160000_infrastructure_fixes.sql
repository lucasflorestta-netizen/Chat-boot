/*
  # Infrastructure fixes

  - Storage buckets: chat-media (public), whatsapp-session (private)
  - Realtime publication for tickets, messages, whatsapp_connection
  - WhatsApp delivery tracking columns on messages
*/

-- ============================================================
-- MESSAGES: WhatsApp delivery tracking
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS whatsapp_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text;

-- Agent/bot/system messages should be delivered via WhatsApp bridge
-- Client messages are already delivered (came from WhatsApp)
UPDATE public.messages
SET whatsapp_delivered = true
WHERE sender_type = 'client' OR media_type = 'note';

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_connection'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_connection;
  END IF;
END $$;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'video/mp4', 'application/pdf', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-session', 'whatsapp-session', false, 1048576)
ON CONFLICT (id) DO NOTHING;

-- chat-media policies
DROP POLICY IF EXISTS "chat_media_select" ON storage.objects;
CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_insert" ON storage.objects;
CREATE POLICY "chat_media_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;
CREATE POLICY "chat_media_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-media');

-- whatsapp-session: service role only (bridge uses service role key)
DROP POLICY IF EXISTS "whatsapp_session_service" ON storage.objects;
CREATE POLICY "whatsapp_session_service" ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'whatsapp-session')
  WITH CHECK (bucket_id = 'whatsapp-session');
