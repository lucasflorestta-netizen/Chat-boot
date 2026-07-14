-- Allow agents to pause the triage/greeting/NPS bot per ticket
-- (e.g. when the contact is actively talking to another integrated bot).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS bot_paused boolean NOT NULL DEFAULT false;
