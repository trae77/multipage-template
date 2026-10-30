import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup } from '../setup.mjs';
import { loginGate } from '../lib/gate.mjs';

const KIT = path.resolve(import.meta.dirname, '..');
async function built() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-gate-'));
  const r = await setup({ answers: path.join(KIT, 'fixtures/acme/answers.json'), assets: path.join(KIT, 'fixtures/acme/assets'), dryRun: true, skipOverflow: true, out: d }, () => {});
  return path.join(r.outDir, 'dist');
}
test('gate passes 8/8 on a normal build', async () => { const g = loginGate(await built()); assert.deepEqual(g.errs, []); assert.equal(g.checks.length, 8); });
const formPage = (d) => ['index.html', 'contact/index.html'].map((f) => path.join(d, f)).find((f) => fs.existsSync(f) && /id="lead-form"/.test(fs.readFileSync(f, 'utf8')));
const breaks = {
  'Turnstile removed': (d) => { const p = formPage(d); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/<div class="cf-turnstile"[^>]*><\/div>/, '')); },
  'honeypot removed': (d) => { const p = formPage(d); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/name="website" tabindex="-1"/, 'name="x"')); },
  'demo deleted': (d) => fs.rmSync(path.join(d, 'demo/client'), { recursive: true }),
  'owner page deleted': (d) => fs.rmSync(path.join(d, 'owner'), { recursive: true }),
  'public login link': (d) => { const p = path.join(d, 'index.html'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('</footer>', '<a href="/owner/">Owner login</a></footer>')); },
  'password login without forgot': (d) => fs.writeFileSync(path.join(d, 'login.html'), '<meta name="robots" content="noindex"><input type="password">'),
};
for (const [name, br] of Object.entries(breaks)) test(`gate FAILS when ${name}`, async () => { const d = await built(); br(d); assert.ok(loginGate(d).errs.length >= 1); });
