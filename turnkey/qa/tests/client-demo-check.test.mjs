// Regression tests for client-demo-check.mjs hardening (QA P2-1 a-f). Run: node --test /workspace/ops/standards/tests/
import test from 'node:test'; import assert from 'node:assert/strict';
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync, spawn } from 'node:child_process';
const CHECK = path.join(import.meta.dirname, '..', 'client-demo-check.mjs');
const BASE = process.env.CDC_FIXTURE || '/workspace/dm/ut/demo/client';
function fixture(mut = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cdc-')); for (const f of fs.readdirSync(BASE)) fs.copyFileSync(path.join(BASE, f), path.join(d, f));
  // Remove the real U-TIME number references the base fixture may carry so the clean case is clean.
  if (mut.html) fs.writeFileSync(path.join(d, 'index.html'), mut.html(fs.readFileSync(path.join(d, 'index.html'), 'utf8')));
  if (mut.engine) fs.appendFileSync(path.join(d, 'engine.js'), '\n' + mut.engine);
  if (mut.css) fs.appendFileSync(path.join(d, 'demo.css'), '\n' + mut.css);
  return d;
}
async function run(dir, { headers = {}, allow } = {}) {
  const srv = http.createServer((q, r) => { const f = path.join(dir, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html', ...headers }); r.end(fs.readFileSync(f)); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}/index.html`, out = fs.mkdtempSync(path.join(os.tmpdir(), 'cdc-out-'));
  const a = [CHECK, url, out]; if (allow) { const af = path.join(out, 'allow.json'); fs.writeFileSync(af, JSON.stringify(allow)); a.push('--allow', af); }
  const res = await new Promise((ok) => { const c = spawn('node', a); let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d)); c.on('close', (code) => ok({ status: code, stdout: o, stderr: '' })); }); srv.close();
  return { code: res.status, out: res.stdout + res.stderr };
}
// A check FAILs if its FAIL line or the indented detail lines under it match.
const fails = (r, re) => r.code !== 0 && r.out.split(/\n(?=PASS|FAIL)/).some((blk) => blk.startsWith('FAIL') && re.test(blk));
const clean = (r) => assert.equal(r.code, 0, r.out);

test('baseline: clean sample demo PASSES', async () => clean(await run(fixture())));
test('(a) off-site request fired only on ADD is caught', async () => {
  const r = await run(fixture({ engine: "document.addEventListener('click',function(e){if(e.target.closest('.cd-add .cd-b'))new Image().src='https://tracker.invalid/add';},true);" }));
  assert.ok(fails(r, /off-site requests/) && /tab\d+-add/.test(r.out), r.out);
});
test('(a) off-site request fired only on RESET is caught', async () => {
  const r = await run(fixture({ engine: "document.getElementById('cd-reset').addEventListener('click',function(){new Image().src='https://tracker.invalid/reset';});" }));
  assert.ok(fails(r, /off-site requests/), r.out);
});
test('(b) real-looking phone in rendered text FAILS; 555 passes; allowlisted number passes only with config', async () => {
  const add = (h) => h.replace('</body>', '<p class="foot">Call (720) 477-8603 or 303-555-0142</p></body>');
  assert.ok(fails(await run(fixture({ html: add })), /phone \(720\) 477-8603/), 'phone not flagged');
  clean(await run(fixture({ html: add }), { allow: { phones: ['720-477-8603'] } }));
});
test('(b) real-looking email in HTML attribute FAILS; example.com passes', async () => {
  const r = await run(fixture({ html: (h) => h.replace('</body>', '<a href="mailto:someone@gmail.com">x</a><p class="foot">sample@example.com</p></body>') }));
  assert.ok(fails(r, /email someone@gmail\.com/) && !/email sample@example\.com/.test(r.out), r.out);
});
test('(c) login form without a password field FAILS', async () => {
  assert.ok(fails(await run(fixture({ html: (h) => h.replace('</main>', '</main><form id="login-form" action="/api/login"><input name="email"><button>Sign in</button></form>') })), /login surface/));
});
test('(c) session cookie FAILS', async () => {
  assert.ok(fails(await run(fixture(), { headers: { 'Set-Cookie': 'session=abc; Path=/' } }), /session\/auth cookies/));
});
test('(c) same-origin auth endpoint request FAILS', async () => {
  assert.ok(fails(await run(fixture({ engine: "document.addEventListener('click',function(){var i=new Image();i.src='/api/session';},true);" })), /auth endpoint requests/));
});
test('(d) overflow on a NON-first tab only is caught', async () => {
  const r = await run(fixture({ css: 'body:has(#cd-tabs button:nth-child(2)[aria-selected="true"]) #cd-panel{min-width:2000px}' }));
  assert.ok(fails(r, /tab 2 overflow/) && !fails(r, /tab 1 overflow/), r.out);
});
test('(f) CSP Report-Only warnings are ignored; enforced violation FAILS', async () => {
  const ro = await run(fixture({ engine: "var s=document.createElement('div');s.setAttribute('style','color:red');document.body.appendChild(s);" , html: (h) => h.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '') }), { headers: { 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'", 'Content-Security-Policy-Report-Only': "default-src 'none'" } });
  assert.ok(!fails(ro, /enforced CSP violations/), ro.out);
  const r = await run(fixture({ engine: "var s=document.createElement('style');s.textContent='x{}';document.head.appendChild(s);var e=document.createElement('script');e.textContent='1';document.body.appendChild(e);" }));
  assert.ok(fails(r, /enforced CSP violations/), r.out);
});
test('(e) uses /usr/bin/google-chrome (CHROME=/nonexistent -> exit 2, never PASS)', () => {
  const res = spawnSync('node', [CHECK, 'http://127.0.0.1:9/', os.tmpdir()], { encoding: 'utf8', env: { ...process.env, CHROME: '/nonexistent' } });
  assert.equal(res.status, 2); assert.match(fs.readFileSync(CHECK, 'utf8'), /\/usr\/bin\/google-chrome/);
});
