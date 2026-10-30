import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateLead, ownerAllowed, normalizePath } from '../worker/index.mjs';
import { makeD1 } from './d1-shim.mjs';

const ORIGIN = 'https://acme-test-co-preview.ttawebdev.com';
const okTs = async () => new Response(JSON.stringify({ success: true }));
const badTs = async () => new Response(JSON.stringify({ success: false }));
const env = (o = {}) => ({ DB: makeD1(), TURNSTILE_SECRET: 'test-only', OWNER_EMAILS: 'owner@acmetestco.test', ACCESS_TEAM: 'https://green-sound-e085.cloudflareaccess.com', ACCESS_AUD: 'aud-test',
  ASSETS: { fetch: async () => new Response('<p>asset</p>', { headers: { 'Content-Type': 'text/html' } }) }, ...o });
const post = (body, h = {}) => new Request(ORIGIN + '/api/leads', { method: 'POST', body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.9', ...h } });
const lead = { name: 'Pat', email: 'pat@acmetestco.test', phone: '(303) 555-0142', service: 'Fence repair', details: 'Gate sags', turnstile: 'tok' };

test('valid lead is saved and shows in owner list query', async () => {
  const e = env();
  const r = await worker.fetch(post(lead), e, {}, okTs);
  assert.equal(r.status, 201);
  const { results } = await e.DB.prepare('SELECT name FROM leads').all();
  assert.deepEqual(results.map((x) => x.name), ['Pat']);
  assert.equal(r.headers.get('Strict-Transport-Security'), 'max-age=300');
  assert.match(r.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});
test('honeypot gets fake 200 and nothing is saved', async () => {
  const e = env(); const r = await worker.fetch(post({ ...lead, website: 'http://spam' }), e, {}, okTs);
  assert.equal(r.status, 200); assert.equal((await e.DB.prepare('SELECT COUNT(*) c FROM leads').first()).c, 0);
});
test('Turnstile fails closed (bad token, missing secret)', async () => {
  assert.equal((await worker.fetch(post(lead), env(), {}, badTs)).status, 403);
  assert.equal((await worker.fetch(post(lead), env({ TURNSTILE_SECRET: '' }), {}, okTs)).status, 403);
});
test('rate limit: 4th request in a minute is 429', async () => {
  const e = env(); const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await worker.fetch(post(lead), e, {}, okTs)).status);
  assert.deepEqual(codes, [201, 201, 201, 429]);
});
test('CSRF: cross-origin and non-JSON rejected', async () => {
  assert.equal((await worker.fetch(post(lead, { Origin: 'https://evil.test' }), env(), {}, okTs)).status, 403);
  assert.equal((await worker.fetch(post(lead, { 'Content-Type': 'text/plain' }), env(), {}, okTs)).status, 403);
});
test('owner area: no/forged JWT or missing Access config -> 403, including disguised paths', async () => {
  for (const p of ['/owner/', '/api/owner/leads', '/OWNER/', '/%6fwner/', '/owner./', '//owner/']) {
    const r = await worker.fetch(new Request(ORIGIN + p, { headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c' } }), env(), {}, okTs);
    assert.equal(r.status, 403, p);
  }
  assert.equal((await worker.fetch(new Request(ORIGIN + '/owner/'), env({ ACCESS_AUD: '' }), {}, okTs)).status, 403);
});
test('ownerAllowed: list, dupes/empties fail closed, service tokens refused', () => {
  const id = { email: 'b@x.test' };
  assert.equal(ownerAllowed(id, { OWNER_EMAILS: 'a@x.test, b@x.test' }), true);
  assert.equal(ownerAllowed(id, { OWNER_EMAILS: 'b@x.test,b@x.test' }), false);
  assert.equal(ownerAllowed(id, { OWNER_EMAILS: 'b@x.test,' }), false);
  assert.equal(ownerAllowed({ ...id, common_name: 'svc' }, { OWNER_EMAILS: 'b@x.test' }), false);
});
test('validation rejects header injection and bad email', () => {
  assert.ok(validateLead({ ...lead, name: 'a\r\nBcc: x' }).error);
  assert.ok(validateLead({ ...lead, email: 'nope' }).error);
  assert.equal(normalizePath('/%2e%2e/owner'), '/owner');
});
test('public assets get security headers; robots disallows', async () => {
  const r = await worker.fetch(new Request(ORIGIN + '/'), env(), {}, okTs);
  assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow'); assert.equal(r.headers.get('X-Frame-Options'), 'DENY');
  assert.match(await (await worker.fetch(new Request(ORIGIN + '/robots.txt'), env())).text(), /Disallow: \//);
});
