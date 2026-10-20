import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeClient, a2pGateOpen } from '../src/config.js';
import { MemoryStore } from '../src/store.js';
import { makeProviders, MockProvider, TwilioSms, ResendEmail } from '../src/providers.js';
import { handleLead, handleMissedCall, handleInboundSms } from '../src/core.js';
import { sendReviewRequests, assertCompliant } from '../src/reviews.js';
import { composeReply } from '../src/llm.js';
import { makeHandler } from '../src/index.js';
import { validTwilioSignature } from '../src/twilio-sig.js';

const base = JSON.parse(readFileSync(new URL('../clients/example.json', import.meta.url)))['example-plumbing'];
const mkClient = (over = {}) => normalizeClient('example-plumbing', { ...base, ...over,
  channels: { ...base.channels, ...(over.channels || {}) }, compliance: { ...base.compliance, ...(over.compliance || {}) } });
const mkCtx = (env = {}) => {
  const sms = new MockProvider(), email = new MockProvider();
  return { env, fetch: async () => { throw new Error('no network in tests'); }, store: new MemoryStore(), providers: { sms, email, dry: true } };
};
const OPEN = { compliance: { a10dlc_approved: true, owner_approved: true } };

test('DRY_RUN is the default and never calls real providers', async () => {
  let called = false;
  const p = makeProviders({ TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 'x', RESEND_API_KEY: 'k' });
  assert.equal(p.dry, true);
  globalThis.fetch = async () => { called = true; };
  const r = await p.sms.send({ to: '+15555550123', body: 'x' });
  assert.equal(r.dry_run, true); assert.equal(called, false);
  assert.equal(makeProviders({ DRY_RUN: 'false' }).dry, false);
});

test('A2P gate needs BOTH flags', () => {
  assert.equal(a2pGateOpen(mkClient()), false);
  assert.equal(a2pGateOpen(mkClient({ compliance: { a10dlc_approved: true } })), false);
  assert.equal(a2pGateOpen(mkClient({ compliance: { owner_approved: true } })), false);
  assert.equal(a2pGateOpen(mkClient(OPEN)), true);
});

test('lead with SMS consent but gate closed -> email reply, consent stored', async () => {
  const ctx = mkCtx();
  const c = mkClient({ channels: { sms_reply: true } });
  const r = await handleLead(ctx, c, { name: 'Ann', phone: '303-555-0101', email: 'a@x.com', message: 'leak', sms_consent: true });
  assert.equal(r.lead_reply, 'email'); assert.equal(ctx.providers.sms.sent.length, 0);
  assert.equal(await ctx.store.getConsent(c.id, 'sms', '+13035550101'), 'granted');
  assert.equal(r.reply_source, 'template');
});

test('lead SMS goes out only with gate open + channel on + consent', async () => {
  const ctx = mkCtx();
  const c = mkClient({ ...OPEN, channels: { sms_reply: true } });
  const r = await handleLead(ctx, c, { phone: '3035550101', sms_consent: true, message: 'furnace out' });
  assert.equal(r.lead_reply, 'sms');
  assert.match(ctx.providers.sms.sent[0].body, /Reply STOP/);
  const r2 = await handleLead(mkCtx(), c, { phone: '3035550102', sms_consent: false, email: 'b@x.com' });
  assert.equal(r2.lead_reply, 'email');
});

test('missed-call SMS is off by default and blocked without both approvals', async () => {
  for (const comp of [{}, { a10dlc_approved: true }, { owner_approved: true }]) {
    const ctx = mkCtx();
    const c = mkClient({ channels: { missed_call_sms: true }, compliance: comp });
    await ctx.store.setConsent(c.id, 'sms', '+13035550101', 'granted');
    const r = await handleMissedCall(ctx, c, { From: '+13035550101' });
    assert.equal(r.text_back, false); assert.equal(r.why, 'a2p_gate_closed');
    assert.equal(ctx.providers.sms.sent.length, 0);
  }
  const r = await handleMissedCall(mkCtx(), mkClient(OPEN), { From: '+13035550101' });
  assert.equal(r.why, 'channel_off');
});

test('missed call alone is not consent', async () => {
  const ctx = mkCtx();
  const r = await handleMissedCall(ctx, mkClient({ ...OPEN, channels: { missed_call_sms: true } }), { From: '+13035550101' });
  assert.equal(r.text_back, false); assert.equal(r.why, 'no_consent');
});

test('STOP suppresses, START restores, HELP answers', async () => {
  const ctx = mkCtx();
  const c = mkClient({ ...OPEN, channels: { sms_reply: true } });
  await ctx.store.setConsent(c.id, 'sms', '+13035550101', 'granted');
  assert.equal((await handleInboundSms(ctx, c, { From: '+13035550101', Body: ' stop ' })).action, 'stop');
  assert.equal(await ctx.store.isSuppressed(c.id, 'sms', '+13035550101'), true);
  const r = await handleLead(ctx, c, { phone: '+13035550101', sms_consent: false, email: 'x@y.com' });
  assert.equal(r.lead_reply, 'email');
  assert.equal((await handleInboundSms(ctx, c, { From: '+13035550101', Body: 'START' })).action, 'start');
  assert.equal(await ctx.store.isSuppressed(c.id, 'sms', '+13035550101'), false);
  const h = await handleInboundSms(ctx, c, { From: '+13035550101', Body: 'Help' });
  assert.equal(h.action, 'help'); assert.match(h.reply, /\+15555550100/);
});

test('reviews: every customer gets the same ask, rating ignored, opt-outs honored, SMS gated', async () => {
  const ctx = mkCtx();
  const c = mkClient({ channels: { review_sms: true } });
  await ctx.store.suppress(c.id, 'email', 'out@x.com', 'unsubscribe');
  const customers = [
    { name: 'Happy', email: 'h@x.com', rating: 5 },
    { name: 'Unhappy', email: 'u@x.com', rating: 1, phone: '3035550109' },
    { name: 'Out', email: 'out@x.com' },
  ];
  await ctx.store.setConsent(c.id, 'sms', '+13035550109', 'granted');
  const r = await sendReviewRequests(ctx, c, customers);
  assert.equal(r.email, 2); assert.equal(r.sms, 0); assert.equal(r.skipped.length, 1);
  const bodies = ctx.providers.email.sent.map((m) => m.body.replace(/Hi \w+, /, ''));
  assert.equal(bodies[0], bodies[1]);
  assert.ok(ctx.providers.email.sent.every((m) => m.headers['List-Unsubscribe']));
  const ctx2 = mkCtx();
  await ctx2.store.setConsent(c.id, 'sms', '+13035550109', 'granted');
  const r2 = await sendReviewRequests(ctx2, mkClient({ ...OPEN, channels: { review_sms: true } }), customers);
  assert.equal(r2.sms, 1);
});

test('reviews reject gating or incentive wording', () => {
  assert.throws(() => assertCompliant('Get 10% off for a review'));
  assert.throws(() => assertCompliant('If you were happy with us, leave a review'));
  assert.doesNotThrow(() => assertCompliant('Would you share your honest feedback in a review?'));
});

test('LLM step: uses LLM JSON, falls back to template on error', async () => {
  const c = mkClient();
  const ok = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"reply":"Hi!","questions":["a","b"]}' } }] }) });
  assert.equal((await composeReply({ LLM_API_KEY: 'k', LLM_BASE_URL: 'http://x' }, c, {}, null, ok)).source, 'llm');
  const bad = async () => ({ ok: false, status: 500 });
  assert.equal((await composeReply({ LLM_API_KEY: 'k', LLM_BASE_URL: 'http://x' }, c, {}, null, bad)).source, 'template');
});

test('adapters build correct Twilio and Resend requests (fake fetch)', async () => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ sid: 'SM1', id: 're1' }) }; };
  assert.equal((await new TwilioSms({ accountSid: 'AC1', authToken: 't', fetchImpl: f }).send({ to: '+1', from: '+2', body: 'b' })).id, 'SM1');
  assert.match(calls[0].url, /Accounts\/AC1\/Messages\.json/);
  assert.equal((await new ResendEmail({ apiKey: 'k', fetchImpl: f }).send({ to: 'a@b.c', from: 'x@y.z', subject: 's', body: 'b' })).id, 're1');
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
});

test('Twilio signature validation', async () => {
  // Example from Twilio docs (webhooks security page).
  const ok = await validTwilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2',
    { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' },
    '0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  assert.equal(ok, true);
  assert.equal(await validTwilioSignature('12345', 'https://x', {}, 'nope'), false);
});

test('worker routes: lead, inbound STOP, reviews auth, logs', async () => {
  const store = new MemoryStore();
  const env = { CLIENTS: JSON.stringify({ 'example-plumbing': base }), ADMIN_TOKEN: 'secret' };
  const h = makeHandler({ store });
  const lead = await h(new Request('https://w/c/example-plumbing/lead', { method: 'POST', body: JSON.stringify({ email: 'a@b.com', message: 'clog' }) }), env);
  assert.equal((await lead.json()).lead_reply, 'email');
  const stop = await h(new Request('https://w/c/example-plumbing/twilio/sms', { method: 'POST', body: 'From=%2B13035550101&Body=STOP' }), env);
  assert.equal(stop.status, 200);
  assert.equal(await store.isSuppressed('example-plumbing', 'sms', '+13035550101'), true);
  assert.equal((await h(new Request('https://w/c/example-plumbing/reviews', { method: 'POST', body: '{}' }), env)).status, 401);
  const rv = await h(new Request('https://w/c/example-plumbing/reviews', { method: 'POST', headers: { Authorization: 'Bearer secret' }, body: JSON.stringify({ customers: [{ email: 'c@d.com' }] }) }), env);
  assert.equal((await rv.json()).email, 1);
  assert.equal((await h(new Request('https://w/c/nope/lead', { method: 'POST', body: '{}' }), env)).status, 404);
  assert.ok(store.logs.some((l) => l.kind === 'send' && l.detail.dry_run === true));
});
