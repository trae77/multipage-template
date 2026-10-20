// Cloudflare Worker entry. Routes (all per client):
//   POST /c/:client/lead          website form (JSON)
//   POST /c/:client/twilio/sms    Twilio inbound SMS webhook (STOP/HELP/START)
//   POST /c/:client/twilio/voice  Twilio missed-call / call-status webhook
//   POST /c/:client/reviews       {customers:[{name,email,phone}]}  (needs ADMIN_TOKEN)
//   GET  /health
import { loadClients } from './config.js';
import { D1Store, MemoryStore } from './store.js';
import { makeProviders } from './providers.js';
import { handleLead, handleMissedCall, handleInboundSms } from './core.js';
import { sendReviewRequests } from './reviews.js';
import { validTwilioSignature } from './twilio-sig.js';

const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } });

export function makeHandler({ store: storeOverride, providers: provOverride, fetchImpl } = {}) {
  return async function fetchHandler(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, dry_run: env.DRY_RUN !== 'false' });
    const m = url.pathname.match(/^\/c\/([a-z0-9-]+)\/(lead|twilio\/sms|twilio\/voice|reviews)$/);
    if (!m || request.method !== 'POST') return json({ error: 'not_found' }, 404);
    const client = loadClients(env)[m[1]];
    if (!client) return json({ error: 'unknown_client' }, 404);
    const ctx = { env, fetch: fetchImpl || fetch, store: storeOverride || (env.DB ? new D1Store(env.DB) : new MemoryStore()),
      providers: provOverride || makeProviders(env) };
    const cors = { 'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*' };
    try {
      if (m[2] === 'lead') {
        const body = await request.json();
        body._ip = request.headers.get('CF-Connecting-IP');
        return json(await handleLead(ctx, client, body), 200, cors);
      }
      if (m[2] === 'reviews') {
        if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'unauthorized' }, 401);
        const { customers = [] } = await request.json();
        return json(await sendReviewRequests(ctx, client, customers));
      }
      const params = Object.fromEntries(new URLSearchParams(await request.text()));
      if (env.TWILIO_AUTH_TOKEN && env.SKIP_TWILIO_SIG !== 'true'
          && !(await validTwilioSignature(env.TWILIO_AUTH_TOKEN, request.url, params, request.headers.get('X-Twilio-Signature')))) {
        return json({ error: 'bad_signature' }, 403);
      }
      if (m[2] === 'twilio/sms') await handleInboundSms(ctx, client, params);
      else await handleMissedCall(ctx, client, params);
      return twiml();
    } catch (e) {
      await ctx.store.log(client.id, 'error', { message: String(e.message || e) });
      return json({ error: 'server_error' }, 500);
    }
  };
}

export default { fetch: makeHandler() };
