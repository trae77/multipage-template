// Forgot-password flow + strict CSP (template port of Big Foot PR #24).
import { test, before, after } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { createApp } from '../server/app.js'; import { FORGOT_OK, RESET_TTL_MS } from '../server/forgot-login.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-forgot-'));
let server, base, ok = true, mails = [], clock = Date.now();
const fetchImpl = async (u, o) => String(u).includes('siteverify') ? new Response(JSON.stringify({ success: ok })) : fetch(u, o);
const call = async (method, p, body, headers = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) }; };
const login = async (email, password) => (await call('POST', '/api/auth/login', { email, password })).body?.token;
const lastToken = () => { const m = mails.at(-1)?.text.match(/#token=([A-Za-z0-9_-]+)/); return m && m[1]; };
let ip = 0; const fresh = () => ({ 'CF-Connecting-IP': `10.1.0.${++ip}` });

before(async () => {
  const app = await createApp({ dataDir: dir, config: { business: { name: 'Test Co' }, booking: {} }, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', noRateLimit: true, staticDir: path.join(dir, 'none'),
    fetchImpl, turnstileSecret: 'test-only', publicOrigin: 'https://example.test', sendEmail: async (m) => { mails.push(m); return { delivered: true }; }, nowMs: () => clock });
  await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('identical reply for known/unknown email; token hashed; 30-min expiry', async () => {
  const a = await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, fresh());
  const b = await call('POST', '/api/auth/forgot', { email: 'nobody@test.dev', turnstile: 't' }, fresh());
  assert.equal(a.status, 200); assert.deepEqual(a.body, b.body); assert.equal(a.body.message, FORGOT_OK);
  assert.equal(mails.length, 1); const tok = lastToken(); assert.ok(tok);
  assert.ok(!fs.readFileSync(path.join(dir, 'site.db')).includes(tok), 'raw token not stored');
  assert.ok(fs.readFileSync(path.join(dir, 'site.db')).includes(crypto.createHash('sha256').update(tok).digest('hex')));
  assert.equal(RESET_TTL_MS, 30 * 60 * 1000);
});

test('Turnstile fails closed, honeypot, cross-origin, per-IP and per-email limits', async () => {
  ok = false; assert.equal((await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, fresh())).status, 403); ok = true;
  assert.equal((await call('POST', '/api/auth/forgot', { email: 'owner@test.dev' }, fresh())).status, 403);
  assert.equal((await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, { ...fresh(), Origin: 'https://evil.test' })).status, 403);
  const n = mails.length; assert.equal((await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't', website: 'bot' }, fresh())).status, 200); assert.equal(mails.length, n);
  const h = fresh(); const codes = []; for (let i = 0; i < 5; i++) codes.push((await call('POST', '/api/auth/forgot', { email: `x${i}@t.dev`, turnstile: 't' }, h)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  for (let i = 0; i < 4; i++) await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, fresh());
  assert.equal(mails.length, 3, 'max 3 links per email per hour');
});

test('reset: single use, old link voided, expiry, sessions revoked, survives restart seed', async () => {
  clock += 2 * 3600e3;
  const sess = await login('owner@test.dev', 'owner-pass-1'); assert.ok(sess);
  await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, fresh()); const t1 = lastToken();
  await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, fresh()); const t2 = lastToken();
  assert.equal((await call('POST', '/api/auth/reset', { token: t1, password: 'a brand new password', turnstile: 't' }, fresh())).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'short', turnstile: 't' }, fresh())).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'a brand new password' }, fresh())).status, 403, 'needs Turnstile');
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'a brand new password', turnstile: 't' }, fresh())).status, 200);
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'a brand new password', turnstile: 't' }, fresh())).status, 400, 'reuse');
  const me = await fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + sess } }); assert.equal(me.status, 401, 'old session revoked');
  assert.ok(await login('owner@test.dev', 'a brand new password')); assert.equal(await login('owner@test.dev', 'owner-pass-1'), undefined);
  await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, fresh()); const t3 = lastToken();
  clock += RESET_TTL_MS + 1;
  assert.equal((await call('POST', '/api/auth/reset', { token: t3, password: 'another new password', turnstile: 't' }, fresh())).status, 400, 'expired');
  const h = fresh(); let last; for (let i = 0; i < 11; i++) last = (await call('POST', '/api/auth/reset', { token: 'x'.repeat(43), password: 'another new password', turnstile: 't' }, h)).status;
  assert.equal(last, 429);
  const app2 = await createApp({ dataDir: dir, config: { business: { name: 'Test Co' }, booking: {} }, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', noRateLimit: true, staticDir: path.join(dir, 'none') });
  const s2 = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const r = await fetch(`http://127.0.0.1:${s2.address().port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@test.dev', password: 'a brand new password' }) });
  s2.close(); assert.equal(r.status, 200, 'restart does not overwrite the reset password');
});

test('pages served with strict CSP (no inline script)', async () => {
  for (const p of ['/forgot-password', '/reset-password']) {
    const r = await fetch(base + p); const html = await r.text(); const csp = r.headers.get('content-security-policy');
    assert.equal(r.status, 200); assert.ok(csp && !/script-src[^;]*unsafe-inline/.test(csp)); assert.match(html, /noindex/);
    for (const tag of html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g)) assert.match(tag, /\ssrc="/);
  }
});
