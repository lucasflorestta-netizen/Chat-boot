/*
# Add lunch break fields to profiles

## Overview
Adds `lunch_start` and `lunch_end` time columns to the `profiles` table so admins can configure each agent's lunch break window in addition to their work start/end hours.

## Changes
- `profiles.lunch_start` (time, nullable) — start of lunch break (e.g. 12:00)
- `profiles.lunch_end` (time, nullable) — end of lunch break (e.g. 13:00)

Both columns are nullable so existing profiles are unaffected. The frontend will treat null as "no lunch break configured".

## Security
No policy changes needed — existing profile UPDATE policy already covers these columns.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lunch_start time,
  ADD COLUMN IF NOT EXISTS lunch_end time;
