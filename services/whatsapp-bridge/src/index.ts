import './env.js';
import { acquireBridgeLock } from './process-lock.js';
import { ensureConnectionRow, startConnectionManager } from './connection.js';
import { logger } from './supabase.js';

async function main() {
  acquireBridgeLock();
  logger.info('Starting WhatsApp bridge...');
  await ensureConnectionRow();
  await startConnectionManager();
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
