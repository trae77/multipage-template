// P2-3: the kit's qa/ copies of the ops standards must never drift.
//   node qa/sync-standards.mjs --from /workspace/ops/standards   copy the ops files in + rewrite qa/standards.lock.json
//   node qa/sync-standards.mjs --check                          FAIL (exit 1) if a kit copy was edited (hash != lock), or,
//                                                               when the ops dir exists (OPS_STANDARDS, default /workspace/ops/standards),
//                                                               if ops changed since the last sync (ops hash != lock). CI runs --check.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const QA = import.meta.dirname, LOCK = path.join(QA, 'standards.lock.json');
const FILES = ['qa-gate.sh', 'd2-render.mjs', 'demo-nav-render.mjs', 'menu-shots.mjs', 'client-demo-check.mjs', 'tests/client-demo-check.test.mjs', 'DEFINITION-OF-DONE.md'];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const a = process.argv.slice(2), from = a[a.indexOf('--from') + 1];
if (a.includes('--from')) {
  const lock = { source: 'ops/standards', syncedAt: new Date().toISOString(), files: {} };
  for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(QA, f)), { recursive: true }); fs.copyFileSync(path.join(from, f), path.join(QA, f)); lock.files[f] = sha(path.join(QA, f)); }
  fs.chmodSync(path.join(QA, 'qa-gate.sh'), 0o755);
  fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n'); console.log('synced', FILES.join(', '));
} else {
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8')); const errs = [];
  const ops = process.env.OPS_STANDARDS || '/workspace/ops/standards';
  for (const f of FILES) {
    if (!fs.existsSync(path.join(QA, f))) { errs.push(`qa/${f} missing`); continue; }
    if (sha(path.join(QA, f)) !== lock.files[f]) errs.push(`qa/${f} edited in the kit (hash != standards.lock.json); change ops/standards and re-sync instead`);
    if (fs.existsSync(path.join(ops, f)) && sha(path.join(ops, f)) !== lock.files[f]) errs.push(`${ops}/${f} changed since last sync: run node qa/sync-standards.mjs --from ${ops}`);
  }
  if (errs.length) { console.error('STANDARDS DRIFT:\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log(`PASS standards in sync (${FILES.length} files${fs.existsSync(ops) ? ', checked against ' + ops : ', lock only (ops dir not present)'})`);
}
