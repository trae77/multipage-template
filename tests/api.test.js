// API tests: auth, roles, quotes, bookings, uploads (+ leads, messages, content, notifications hook).
import { test, before, after } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createApp } from '../server/app.js'; import { hooks } from '../server/notify.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-test-'));
const NOW = new Date('2026-10-19T12:00:00'); // Monday
const config = { business: { name: 'Test Co' }, booking: { slotMinutes: 60, dayStart: '09:00', dayEnd: '12:00', days: [1, 2, 3, 4, 5], leadDays: 1, windowDays: 14 } };
let server, base; const events = [];
const call = async (method, p, { token, body, form } = {}) => {
  const h = {}; if (token) h.Authorization = 'Bearer ' + token; if (body) h['Content-Type'] = 'application/json';
  const r = await fetch(base + p, { method, headers: h, body: form || (body ? JSON.stringify(body) : undefined) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).body.token;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
let owner, cust, cust2, custId, cust2Id;

before(async () => {
  hooks.push((e, d) => events.push(e));
  const app = await createApp({ dataDir: dir, config, ownerEmail: 'owner@test.dev', ownerPassword: 'owner-pass-1', now: () => NOW, noRateLimit: true, staticDir: path.join(dir, 'none') });
  await new Promise((r) => { server = app.listen(0, r); }); base = `http://127.0.0.1:${server.address().port}`;
  owner = await login('owner@test.dev', 'owner-pass-1');
  custId = (await call('POST', '/api/customers', { token: owner, body: { name: 'Cust One', email: 'one@test.dev', password: 'password-1' } })).body.id;
  cust2Id = (await call('POST', '/api/customers', { token: owner, body: { name: 'Cust Two', email: 'two@test.dev', password: 'password-2' } })).body.id;
  cust = await login('one@test.dev', 'password-1'); cust2 = await login('two@test.dev', 'password-2');
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('auth: wrong password rejected, me works, logout revokes token', async () => {
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'owner@test.dev', password: 'nope' } })).status, 401);
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  const t = await login('owner@test.dev', 'owner-pass-1');
  assert.equal((await call('GET', '/api/auth/me', { token: t })).body.user.role, 'owner');
  await call('POST', '/api/auth/logout', { token: t });
  assert.equal((await call('GET', '/api/auth/me', { token: t })).status, 401);
});

test('roles: customers cannot use owner endpoints', async () => {
  for (const [m, p] of [['GET', '/api/leads'], ['GET', '/api/customers'], ['POST', '/api/quotes'], ['POST', '/api/invoices'], ['PATCH', '/api/bookings/1'], ['PUT', '/api/content/site']])
    assert.equal((await call(m, p, { token: cust, body: m === 'GET' ? undefined : {} })).status, 403, `${m} ${p}`);
  assert.equal((await call('POST', '/api/customers', { token: owner, body: { name: 'X', email: 'one@test.dev', password: 'password-9' } })).status, 409);
});

test('leads: public submit with validation, owner inbox, notification hook', async () => {
  assert.equal((await call('POST', '/api/leads', { body: { name: 'A' } })).status, 400);
  assert.equal((await call('POST', '/api/leads', { body: { name: 'A', phone: '555', message: 'Fix roof' } })).status, 201);
  const l = await call('GET', '/api/leads', { token: owner }); assert.equal(l.body[0].message, 'Fix roof');
  assert.equal((await call('PATCH', `/api/leads/${l.body[0].id}`, { token: owner, body: { status: 'won' } })).status, 200);
  assert.ok(events.includes('lead.created'));
});

test('quotes: owner builds, customer sees only own sent quotes and can accept once', async () => {
  assert.equal((await call('POST', '/api/quotes', { token: owner, body: { customerId: custId, title: 'T', lines: [] } })).status, 400);
  const draft = (await call('POST', '/api/quotes', { token: owner, body: { customerId: custId, title: 'Draft', lines: [{ desc: 'a', qty: 1, unit: 100 }] } })).body;
  const sent = (await call('POST', '/api/quotes', { token: owner, body: { customerId: custId, title: 'Roof', status: 'sent', lines: [{ desc: 'Labor', qty: 2, unit: 5000 }, { desc: '', qty: 1, unit: 1 }] } })).body;
  assert.equal(sent.lines.length, 1);
  const mine = (await call('GET', '/api/quotes', { token: cust })).body;
  assert.deepEqual(mine.map((q) => q.id), [sent.id]); // draft hidden
  assert.equal((await call('GET', '/api/quotes', { token: cust2 })).body.length, 0);
  assert.equal((await call('PATCH', `/api/quotes/${sent.id}`, { token: cust2, body: { status: 'accepted' } })).status, 403);
  assert.equal((await call('PATCH', `/api/quotes/${draft.id}`, { token: cust, body: { status: 'accepted' } })).status, 403);
  assert.equal((await call('PATCH', `/api/quotes/${sent.id}`, { token: cust, body: { status: 'invoiced' } })).status, 403);
  assert.equal((await call('PATCH', `/api/quotes/${sent.id}`, { token: cust, body: { status: 'accepted' } })).status, 200);
  assert.equal((await call('PATCH', `/api/quotes/${sent.id}`, { token: cust, body: { status: 'declined' } })).status, 403);
  const inv = await call('POST', '/api/invoices', { token: owner, body: { customerId: custId, quoteId: sent.id, title: 'Inv', amount: 10000 } });
  assert.equal(inv.status, 201);
  assert.equal((await call('GET', '/api/invoices', { token: cust })).body[0].amount, 10000);
  assert.equal((await call('GET', '/api/invoices', { token: cust2 })).body.length, 0);
  assert.ok(events.includes('quote.sent'));
});

test('bookings: availability, no double-booking, rules enforced, owner confirms', async () => {
  const slots = (await call('GET', '/api/bookings/availability?date=2026-10-21')).body;
  assert.deepEqual(slots.map((s) => s.time), ['09:00', '10:00', '11:00']);
  assert.equal((await call('GET', '/api/bookings/availability?date=2026-10-24')).body.length, 0); // Saturday
  const b = { date: '2026-10-21', time: '10:00', name: 'Cust', phone: '555' };
  assert.equal((await call('POST', '/api/bookings', { body: { ...b, date: '2026-10-19' } })).status, 409); // same day, lead time
  assert.equal((await call('POST', '/api/bookings', { body: { ...b, time: '10:30' } })).status, 409);
  assert.equal((await call('POST', '/api/bookings', { body: { ...b, name: '' } })).status, 400);
  const ok = await call('POST', '/api/bookings', { token: cust, body: b }); assert.equal(ok.status, 201);
  assert.equal((await call('POST', '/api/bookings', { body: b })).status, 409);
  assert.equal((await call('GET', '/api/bookings/availability?date=2026-10-21')).body.find((s) => s.time === '10:00').available, false);
  assert.equal((await call('GET', '/api/bookings', { token: cust })).body.length, 1);
  assert.equal((await call('GET', '/api/bookings', { token: cust2 })).body.length, 0);
  assert.equal((await call('PATCH', `/api/bookings/${ok.body.id}`, { token: owner, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await call('POST', '/api/bookings', { body: b })).status, 201); // freed slot rebookable
});

test('uploads: customer uploads to own job only, images only, files private', async () => {
  const job = (await call('POST', '/api/jobs', { token: owner, body: { customerId: custId, title: 'Job' } })).body;
  const form = (buf, type, name) => { const f = new FormData(); f.append('photo', new Blob([buf], { type }), name); return f; };
  assert.equal((await call('POST', `/api/jobs/${job.id}/photos`, { token: cust2, form: form(PNG, 'image/png', 'a.png') })).status, 404);
  assert.equal((await call('POST', `/api/jobs/${job.id}/photos`, { token: cust, form: form(Buffer.from('hi'), 'text/plain', 'a.txt') })).status, 415);
  const up = await call('POST', `/api/jobs/${job.id}/photos`, { token: cust, form: form(PNG, 'image/png', 'a.png') }); assert.equal(up.status, 201);
  const list = (await call('GET', `/api/jobs/${job.id}/photos`, { token: owner })).body; assert.equal(list.length, 1); assert.equal(list[0].by, 'customer');
  assert.equal((await fetch(base + up.body.url)).status, 404);
  assert.equal((await fetch(base + up.body.url + '?t=' + cust2)).status, 404);
  const ok = await fetch(base + up.body.url + '?t=' + cust); assert.equal(ok.status, 200); assert.equal(Buffer.from(await ok.arrayBuffer()).length, PNG.length);
  assert.equal((await call('PATCH', `/api/jobs/${job.id}`, { token: owner, body: { status: 'Complete', progress: 150 } })).status, 200);
  assert.equal((await call('GET', '/api/jobs', { token: cust })).body.find((j) => j.id === job.id).progress, 100);
});

test('messages and content', async () => {
  assert.equal((await call('POST', '/api/messages', { token: cust, body: { body: 'Hello' } })).status, 201);
  assert.equal((await call('POST', '/api/messages', { token: owner, body: { customerId: custId, body: 'Hi back' } })).status, 201);
  assert.equal((await call('GET', '/api/messages', { token: cust })).body.length, 2);
  assert.equal((await call('GET', '/api/messages', { token: cust2 })).body.length, 0);
  assert.equal((await call('PUT', '/api/content/site', { token: owner, body: { value: { headline: 'New' } } })).status, 200);
  assert.equal((await call('PUT', '/api/content/evil', { token: owner, body: { value: {} } })).status, 404);
  assert.equal((await call('GET', '/api/content')).body.site.headline, 'New');
});
