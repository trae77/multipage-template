// CI/setup: build Acme Test Co, serve it through the real Worker locally, run ops/standards qa-gate.sh with the template evidence file.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { setup } from '../setup.mjs'; import { runQaGate } from '../lib/qagate.mjs';
const KIT = path.resolve(import.meta.dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-qagate-'));
const r = await setup({ answers: path.join(KIT, 'fixtures/acme/answers.json'), assets: path.join(KIT, 'fixtures/acme/assets'), dryRun: true, skipOverflow: true, out }, () => {});
if (r.fail.length) { console.error('setup failed:', r.fail); process.exit(1); }
const g = await runQaGate(path.join(out, 'dist'), path.join(KIT, 'qa/EVIDENCE-template.md'));
console.log(g.out); process.exit(/QA GATE: PASS/.test(g.out) ? 0 : 1);
