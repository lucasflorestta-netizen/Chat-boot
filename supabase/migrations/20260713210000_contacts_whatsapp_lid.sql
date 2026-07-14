-- Add WhatsApp LID column for Baileys 7 addressing (outbound prefers @lid)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS whatsapp_lid text;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_whatsapp_lid_unique
  ON public.contacts (whatsapp_lid)
  WHERE whatsapp_lid IS NOT NULL;
