import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function detectLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || /vethernet|wsl|docker|hyper-v|vmware|virtualbox/i.test(name)) {
      continue;
    }
    for (const entry of entries) {
      if (
        entry.family !== 'IPv4' ||
        entry.internal ||
        entry.address.startsWith('169.254.')
      ) {
        continue;
      }
      candidates.push(entry.address);
    }
  }
  const preferred =
    candidates.find((ip) => ip.startsWith('192.168.')) ??
    candidates.find((ip) => ip.startsWith('10.')) ??
    candidates[0];
  return preferred ?? '192.168.1.186';
}

const host = process.env.HOST?.trim() || '0.0.0.0';
const port = process.env.PORT?.trim() || '3000';
const distDir = process.env.NEXT_DIST_DIR?.trim() || '.next-preview';
const lanIp = detectLanIp();

const existingOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const mergedOrigins = Array.from(new Set(['192.168.1.186', lanIp, ...existingOrigins]));

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

console.log(`\n[dev:lan] LAIKONA NAILS preview en red local`);
console.log(`  - Red local (Mac / cel): http://${lanIp}:${port}`);
console.log(`  - Esta PC:               http://localhost:${port}`);
console.log(`  - distDir aislado:       ${distDir} (.next libre para build/verify)\n`);

const child = spawn(process.execPath, [nextBin, 'dev', '-H', host, '-p', port], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_DIST_DIR: distDir,
    DEV_ALLOWED_ORIGINS: mergedOrigins.join(','),
  },
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
