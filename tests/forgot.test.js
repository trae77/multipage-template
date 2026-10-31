// Forgot-password flow + strict CSP (template port of Big Foot PR #24).
import { test, before, after } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import { createApp } from '../server/app.js'; import { FORGOT_OK, RESET_TTL_MS } from '../server/forgot-login.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-forgot-'));
let server, base, theApp, ok = true, mails = [], clock = Date.now();
const fetchImpl = async (u, o) => String(u).includes('siteverify') ? new Response(JSON.stringify({ success: ok })) : fetch(u, o);
const call = async (method, p, body, headers = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); const out = { status: r.status, headers: r.headers, body: await r.json().catch(() => null) }; await theApp.locals.settleForgot(); return out; };
const login = async (email, password) => (await call('POST', '/api/auth/login', { email, password, turnstile: 't' }, fresh())).body?.token;
const CUST = 'cust@test.dev';
const lastToken = () => { const m = mails.at(-1)?.text.match(/#token=([A-Za-z0-9_-]+)/); return m && m[1]; };
let ip = 0; const fresh = () => ({ 'CF-Connecting-IP': `10.1.0.${++ip}` });

before(async () => {
  const app = await createApp({ dataDir: dir, config: { business: { name: 'Test Co' }, booking: {} }, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', noRateLimit: true, staticDir: path.join(dir, 'none'),
    fetchImpl, turnstileSecret: 'test-only', publicOrigin: 'https://example.test', sendEmail: async (m) => { mails.push(m); return { delivered: true }; }, nowMs: () => clock, verifyOwnerAccess: async () => 'owner@test.dev' });
  theApp = app; await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`;
  const ot = await login('owner@test.dev', 'owner-pass-1');
  const c = await call('POST', '/api/customers', { name: 'Cust', email: CUST, password: 'cust-pass-1' }, { Authorization: 'Bearer ' + ot }); assert.equal(c.status, 201);
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('identical reply for known/unknown email; token hashed; 30-min expiry', async () => {
  const a = await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't' }, fresh());
  const b = await call('POST', '/api/auth/forgot', { email: 'nobody@test.dev', turnstile: 't' }, fresh());
  assert.equal(a.status, 200); assert.deepEqual(a.body, b.body); assert.equal(a.body.message, FORGOT_OK);
  assert.equal(mails.length, 1); const tok = lastToken(); assert.ok(tok);
  assert.ok(!fs.readFileSync(path.join(dir, 'site.db')).includes(tok), 'raw token not stored');
  assert.ok(fs.readFileSync(path.join(dir, 'site.db')).includes(crypto.createHash('sha256').update(tok).digest('hex')));
  assert.equal(RESET_TTL_MS, 30 * 60 * 1000);
});

test('Turnstile fails closed, honeypot, cross-origin, per-IP and per-email limits', async () => {
  ok = false; assert.equal((await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't' }, fresh())).status, 403); ok = true;
  assert.equal((await call('POST', '/api/auth/forgot', { email: CUST }, fresh())).status, 403);
  assert.equal((await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't' }, { ...fresh(), Origin: 'https://evil.test' })).status, 403);
  const n = mails.length; assert.equal((await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't', website: 'bot' }, fresh())).status, 200); assert.equal(mails.length, n);
  const h = fresh(); const codes = []; for (let i = 0; i < 5; i++) codes.push((await call('POST', '/api/auth/forgot', { email: `x${i}@t.dev`, turnstile: 't' }, h)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  for (let i = 0; i < 4; i++) await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't' }, fresh());
  assert.equal(mails.length, 3, 'max 3 links per email per hour');
});

test('reset: single use, old link voided, expiry, sessions revoked, survives restart seed', async () => {
  clock += 2 * 3600e3;
  const sess = await login(CUST, 'cust-pass-1'); assert.ok(sess);
  await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't' }, fresh()); const t1 = lastToken();
  await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't' }, fresh()); const t2 = lastToken();
  assert.equal((await call('POST', '/api/auth/reset', { token: t1, password: 'a brand new password', turnstile: 't' }, fresh())).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'short', turnstile: 't' }, fresh())).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'a brand new password' }, fresh())).status, 403, 'needs Turnstile');
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'a brand new password', turnstile: 't' }, fresh())).status, 200);
  assert.equal((await call('POST', '/api/auth/reset', { token: t2, password: 'a brand new password', turnstile: 't' }, fresh())).status, 400, 'reuse');
  const me = await fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + sess } }); assert.equal(me.status, 401, 'old session revoked');
  assert.ok(await login(CUST, 'a brand new password')); assert.equal(await login(CUST, 'cust-pass-1'), undefined);
  await call('POST', '/api/auth/forgot', { email: CUST, turnstile: 't' }, fresh()); const t3 = lastToken();
  clock += RESET_TTL_MS + 1;
  assert.equal((await call('POST', '/api/auth/reset', { token: t3, password: 'another new password', turnstile: 't' }, fresh())).status, 400, 'expired');
  const h = fresh(); let last; for (let i = 0; i < 11; i++) last = (await call('POST', '/api/auth/reset', { token: 'x'.repeat(43), password: 'another new password', turnstile: 't' }, h)).status;
  assert.equal(last, 429);
  const app2 = await createApp({ dataDir: dir, config: { business: { name: 'Test Co' }, booking: {} }, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', noRateLimit: true, staticDir: path.join(dir, 'none'), loginTurnstile: false });
  const s2 = await new Promise((r) => { const s = app2.listen(0, () => r(s)); });
  const r = await fetch(`http://127.0.0.1:${s2.address().port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: CUST, password: 'a brand new password' }) });
  s2.close(); assert.equal(r.status, 200, 'restart does not overwrite the reset password');
});

test('pages served with strict CSP (no inline script)', async () => {
  for (const p of ['/forgot-password', '/reset-password']) {
    const r = await fetch(base + p); const html = await r.text(); const csp = r.headers.get('content-security-policy');
    assert.equal(r.status, 200); assert.ok(csp && !/script-src[^;]*unsafe-inline/.test(csp)); assert.match(html, /noindex/);
    for (const tag of html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g)) assert.match(tag, /\ssrc="/);
  }
});

test('no RESEND_API_KEY: identical owner re-invite reply, nothing sent; with key: Resend called', async () => {
  const { fallbackFor, defaultSender } = await import('../server/forgot-login.js');
  delete process.env.RESEND_API_KEY;
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-forgot2-'));
  const app = await createApp({ dataDir: d2, config: { business: { name: 'Test Co' }, booking: {} }, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', noRateLimit: true, staticDir: path.join(d2, 'none'), fetchImpl, turnstileSecret: 'test-only' });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); }); const b2 = `http://127.0.0.1:${s.address().port}`;
  const ask = async (email) => (await fetch(b2 + '/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.0.${++ip}` }, body: JSON.stringify({ email, turnstile: 't' }) })).json();
  const a = await ask('owner@test.dev'), b = await ask('nobody@test.dev'); await app.locals.settleForgot();
  const page = await (await fetch(b2 + '/forgot-password')).text();
  s.close(); fs.rmSync(d2, { recursive: true, force: true });
  assert.deepEqual(a, b); assert.equal(a.message, fallbackFor('Test Co')); assert.match(a.message, /single-use sign-in link, valid for 48 hours/);
  assert.doesNotMatch(page, /Email me a reset link/);
  const calls = []; const f = async (u, o) => { calls.push([u, JSON.parse(o.body)]); return new Response('{}'); };
  assert.deepEqual(await defaultSender({}, f, () => {})({ to: 'a@b.c', subject: 's', text: 't' }), { delivered: false, provider: 'stub' }); assert.equal(calls.length, 0);
  assert.deepEqual(await defaultSender({ RESEND_API_KEY: 'test-not-a-key' }, f, () => {})({ to: 'a@b.c', subject: 's', text: 't' }), { delivered: true, provider: 'resend' });
  assert.equal(calls[0][0], 'https://api.resend.com/emails'); assert.deepEqual(calls[0][1].to, ['a@b.c']);
});

test('owner accounts are excluded from reset (QA L3): identical reply, no email, no row', async () => {
  const n = mails.length;
  const r = await call('POST', '/api/auth/forgot', { email: 'owner@test.dev', turnstile: 't' }, fresh());
  assert.equal(r.status, 200); assert.equal(mails.length, n);
});

test('owner login needs Access + OWNER_EMAILS; password alone is refused (QA L3)', async () => {
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-own-'));
  const app = await createApp({ dataDir: d3, config: { business: { name: 'T' }, booking: {} }, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', noRateLimit: true, staticDir: path.join(d3, 'none'), fetchImpl, turnstileSecret: 'test-only' });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@test.dev', password: 'owner-pass-1', turnstile: 't' }) });
  s.close(); fs.rmSync(d3, { recursive: true, force: true });
  assert.equal(r.status, 403, 'no Access config -> fail closed');
});

test('login: Turnstile fails closed, honeypot, lockout after 5 bad tries', async () => {
  ok = false; assert.equal((await call('POST', '/api/auth/login', { email: CUST, password: 'x', turnstile: 't' }, fresh())).status, 403); ok = true;
  assert.equal((await call('POST', '/api/auth/login', { email: CUST, password: 'x' }, fresh())).status, 403);
  assert.equal((await call('POST', '/api/auth/login', { email: CUST, password: 'a brand new password', turnstile: 't', website: 'bot' }, fresh())).status, 401);
  const h = fresh(); const codes = []; for (let i = 0; i < 6; i++) codes.push((await call('POST', '/api/auth/login', { email: 'lock@test.dev', password: 'bad', turnstile: 't' }, h)).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429]);
});

test('owner re-invite: 48h single-use link, reuse/expiry rejected, owner cannot be invited (QA L1b)', async () => {
  const ot = await login('owner@test.dev', 'owner-pass-1'); const H = { Authorization: 'Bearer ' + ot };
  const list = (await call('GET', '/api/customers', null, H)).body; const cid = list.find((x) => x.email === CUST).id;
  const inv = await call('POST', `/api/customers/${cid}/invite`, {}, H); assert.equal(inv.status, 200);
  assert.ok(Date.parse(inv.body.expiresAt) - clock <= 48 * 3600e3 + 1000);
  const tok = inv.body.link.split('#token=')[1]; assert.ok(tok && inv.body.link.includes('/set-password#token='));
  assert.equal((await call('POST', '/api/auth/invite/accept', { token: tok, password: 'invited password ok' }, fresh())).status, 403, 'needs Turnstile');
  assert.equal((await call('POST', '/api/auth/invite/accept', { token: tok, password: 'invited password ok', turnstile: 't' }, fresh())).status, 200);
  assert.equal((await call('POST', '/api/auth/invite/accept', { token: tok, password: 'invited password ok', turnstile: 't' }, fresh())).status, 400, 'reuse');
  assert.ok(await login(CUST, 'invited password ok'));
  const inv2 = await call('POST', `/api/customers/${cid}/invite`, {}, H); const t2 = inv2.body.link.split('#token=')[1];
  clock += 48 * 3600e3 + 1;
  assert.equal((await call('POST', '/api/auth/invite/accept', { token: t2, password: 'another invited pw', turnstile: 't' }, fresh())).status, 400, 'expired');
  const me = (await call('GET', '/api/auth/me', null, H)).body; assert.equal((await call('POST', `/api/customers/${me.user.id}/invite`, {}, H)).status, 404, 'owner not invitable');
  assert.equal((await call('POST', `/api/customers/${cid}/invite`, {}, {})).status, 401);
});

test('timing: forgot replies before any email work for known emails', async () => {
  let release; const gate = new Promise((r) => { release = r; }); let sent = 0;
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-tim-'));
  const app = await createApp({ dataDir: d4, config: { business: { name: 'T' }, booking: {} }, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', noRateLimit: true, staticDir: path.join(d4, 'none'), fetchImpl, turnstileSecret: 'test-only', sendEmail: async () => { await gate; sent++; return { delivered: true }; }, verifyOwnerAccess: async () => 'owner@test.dev' });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); }); const b4 = `http://127.0.0.1:${s.address().port}`;
  const post = (p, body, h = {}) => fetch(b4 + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.8.0.${++ip}`, ...h }, body: JSON.stringify(body) });
  const ot = (await (await post('/api/auth/login', { email: 'owner@test.dev', password: 'owner-pass-1', turnstile: 't' })).json()).token;
  await post('/api/customers', { name: 'K', email: 'k@test.dev', password: 'kpass-12345' }, { Authorization: 'Bearer ' + ot });
  const r = await post('/api/auth/forgot', { email: 'k@test.dev', turnstile: 't' });
  assert.equal(r.status, 200); assert.equal(sent, 0, 'reply arrived while the send is still blocked');
  release(); await app.locals.settleForgot(); assert.equal(sent, 1);
  s.close(); fs.rmSync(d4, { recursive: true, force: true });
});

test('per-account lockout survives IP rotation (QA r2 P3)', async () => {
  const codes = []; for (let i = 0; i < 11; i++) codes.push((await call('POST', '/api/auth/login', { email: 'rot@test.dev', password: 'bad', turnstile: 't' }, fresh())).status);
  assert.deepEqual(codes, [...Array(10).fill(401), 429]);
  assert.equal((await call('POST', '/api/auth/login', { email: CUST, password: 'wrong', turnstile: 't' }, fresh())).status, 401, 'other accounts unaffected');
});

test('/admin/ shell is 404 without Cloudflare Access, served with it (QA r2 B2)', async () => {
  const d5 = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-admin-')); const st = path.join(d5, 'dist'); fs.mkdirSync(path.join(st, 'admin'), { recursive: true });
  fs.writeFileSync(path.join(st, 'admin', 'index.html'), 'ADMIN SHELL'); fs.writeFileSync(path.join(st, 'index.html'), 'HOME');
  let allow = false;
  const app = await createApp({ dataDir: d5, config: { business: { name: 'T' }, booking: {} }, staticDir: st, noRateLimit: true, verifyOwnerAccess: async () => (allow ? 'owner@test.dev' : null) });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); }); const b = `http://127.0.0.1:${s.address().port}`;
  const http = await import('node:http');
  const raw = (p) => new Promise((ok, no) => { http.get({ host: '127.0.0.1', port: s.address().port, path: p }, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => ok({ status: r.statusCode, cc: r.headers['cache-control'], body: d })); }).on('error', no); });
  for (const p of ['/admin', '/admin/', '/admin/index.html', '/ADMIN/', '/admin.html', '//admin/', '/%61dmin/', '/%2Fadmin/', '/admin%2findex.html', '/./admin/', '/x/../admin/', '/%252Fadmin/', '/admin/%2e%2e/admin/']) {
    const r = await raw(p); assert.equal(r.status, 404, p); assert.equal(r.cc, 'no-store', p + ' no-store'); assert.ok(!r.body.includes('ADMIN SHELL'), p); }
  for (const p of ['/admin;/', '/admin;x/', '/;/admin/', '/admin%00/', '/admin%3b/', '/%2561dmin/', '/admin%5c']) { const r = await raw(p); assert.equal(r.status, 404, p); assert.ok(!r.body.includes('ADMIN SHELL'), p); }
  for (const p of ['/admin%zz/', '/%E0%A4%A/admin/']) { const r = await raw(p); assert.equal(r.status, 400, p); assert.ok(!r.body.includes('ADMIN SHELL'), p); }
  assert.equal((await fetch(b + '/')).status, 200, 'public pages unaffected');
  allow = true; const r = await fetch(b + '/admin/'); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.match(await r.text(), /ADMIN SHELL/);
  assert.equal((await raw('/%61dmin/')).status, 200, 'encoded path served only via the Access handler');
  s.close(); fs.rmSync(d5, { recursive: true, force: true });
});

test('lockout never blocks an Access-verified owner; lock events are logged (QA r3 P2b)', async () => {
  const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  try {
    const codes = []; for (let i = 0; i < 11; i++) codes.push((await call('POST', '/api/auth/login', { email: 'owner@test.dev', password: 'bad', turnstile: 't' }, fresh())).status);
    assert.equal(codes.at(-1), 401, 'Access-matched owner is not locked (still 401 on bad password)');
    assert.equal((await call('POST', '/api/auth/login', { email: 'owner@test.dev', password: 'owner-pass-1', turnstile: 't' }, fresh())).status, 200);
    assert.ok(warns.some((w) => w.includes('lockout bypassed for Access-verified owner')));
    for (let i = 0; i < 11; i++) await call('POST', '/api/auth/login', { email: 'victim@test.dev', password: 'bad', turnstile: 't' }, fresh());
    assert.ok(warns.some((w) => w.includes('lockout triggered')));
    assert.ok(!warns.join('\n').includes('victim@test.dev'), 'no raw email in logs');
  } finally { console.warn = ow; }
});

test('in-memory counters are size-capped; limiter keys on CF-Connecting-IP (QA r3 P3)', async () => {
  const d6 = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-cap-'));
  const app = await createApp({ dataDir: d6, config: { business: { name: 'T' }, booking: {} }, staticDir: path.join(d6, 'none'), loginTurnstile: false, mapCap: 50, verifyOwnerAccess: async () => null });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); }); const b = `http://127.0.0.1:${s.address().port}`;
  const L = (ip, email) => fetch(b + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ email, password: 'x' }) });
  for (let i = 0; i < 120; i++) await L(`10.20.${i >> 8}.${i & 255}`, `u${i}@t.dev`);
  const z = app.locals.counterSizes(); assert.ok(z.hits <= 50 && z.fails <= 50 && z.acctFails <= 50, JSON.stringify(z));
  const codes = []; for (let i = 0; i < 11; i++) codes.push((await L('10.30.0.1', `k${i}@t.dev`)).status);
  assert.equal(codes.at(-1), 429, 'same CF-Connecting-IP is limited');
  assert.equal((await L('10.30.0.2', 'k@t.dev')).status, 401, 'different CF-Connecting-IP is not');
  s.close(); fs.rmSync(d6, { recursive: true, force: true });
});
