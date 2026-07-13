import fs from 'fs';
import path from 'path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LOCK_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/bridge.lock');

function processLooksLikeBridge(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }

  if (process.platform === 'win32') {
    try {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId = ${pid}\\").CommandLine"`,
        { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return /whatsapp-bridge|tsx.*src[/\\]index\.ts/i.test(out);
    } catch {
      // If we can't inspect the process, treat the lock as stale (Windows reuses PIDs).
      return false;
    }
  }

  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return /whatsapp-bridge|tsx.*src\/index\.ts/i.test(cmdline);
  } catch {
    return false;
  }
}

export function acquireBridgeLock(): void {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });

  if (fs.existsSync(LOCK_PATH)) {
    try {
      const previousPid = Number(fs.readFileSync(LOCK_PATH, 'utf8').trim());
      if (previousPid && previousPid !== process.pid && processLooksLikeBridge(previousPid)) {
        throw new Error(
          `Another WhatsApp bridge is already running (pid ${previousPid}). Stop it before starting a new one.`,
        );
      }
    } catch (err) {
      if ((err as Error).message?.includes('already running')) throw err;
      // Corrupt / stale lock — take over.
    }
  }

  fs.writeFileSync(LOCK_PATH, String(process.pid), 'utf8');

  const release = () => {
    try {
      if (fs.existsSync(LOCK_PATH)) {
        const current = fs.readFileSync(LOCK_PATH, 'utf8').trim();
        if (current === String(process.pid)) fs.unlinkSync(LOCK_PATH);
      }
    } catch {
      // ignore
    }
  };

  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });
}
