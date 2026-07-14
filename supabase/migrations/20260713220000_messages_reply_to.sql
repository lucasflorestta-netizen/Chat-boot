-- Reply-to (quoted messages) + expand chat-media MIME for browser recordings

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
    REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_reply_to_idx
  ON public.messages(reply_to_message_id);

-- Allow MediaRecorder outputs (webm/mp4) used by voice notes in the agent UI
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/mp4',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'application/octet-stream'
]
WHERE id = 'chat-media';
