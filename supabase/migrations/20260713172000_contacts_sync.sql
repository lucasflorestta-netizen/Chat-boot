/*
  # WhatsApp contacts agenda sync

  - Track UI-initiated contact sync requests on whatsapp_connection
  - Publish contacts to supabase_realtime so the agenda updates live during sync
*/

ALTER TABLE public.whatsapp_connection
  ADD COLUMN IF NOT EXISTS contacts_sync_requested_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
  END IF;
END $$;
