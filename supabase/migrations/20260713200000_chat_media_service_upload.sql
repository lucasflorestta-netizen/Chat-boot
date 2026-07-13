/*
  # Allow WhatsApp bridge (service role) to upload inbound chat media

  Agents already upload via authenticated role; the bridge uses the service role key.
*/

DROP POLICY IF EXISTS "chat_media_insert_service" ON storage.objects;
CREATE POLICY "chat_media_insert_service" ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_update_service" ON storage.objects;
CREATE POLICY "chat_media_update_service" ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'chat-media')
  WITH CHECK (bucket_id = 'chat-media');
