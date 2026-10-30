import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startPreview } from './preview-server.mjs';
const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function runQaGate(dist, evidence) {
  const pv = await startPreview(dist);
  try {
    const out = await new Promise((resolve) => {
      const c = spawn('bash', [path.join(KIT, 'qa/qa-gate.sh'), pv.url, KIT, evidence], { stdio: ['ignore', 'pipe', 'pipe'] });
      let s = ''; c.stdout.on('data', (d) => (s += d)); c.stderr.on('data', (d) => (s += d)); c.on('close', () => resolve(s));
    });
    const lines = out.split('\n');
    return { out, fails: lines.filter((l) => l.startsWith('FAIL')), passes: lines.filter((l) => l.startsWith('PASS')).length };
  } finally { pv.close(); }
}
