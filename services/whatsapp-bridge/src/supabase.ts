import './env.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';

export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Copy services/whatsapp-bridge/.env.example to .env and fill the values.',
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const POLL_INTERVAL_MS = parseInt(process.env.BRIDGE_POLL_INTERVAL_MS || '5000', 10);
export const SESSION_BUCKET = 'whatsapp-session';
export const SESSION_PREFIX = 'baileys';
