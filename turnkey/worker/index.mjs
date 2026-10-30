// Turnkey client Worker (ported from Big Foot bigfoot-preview): static assets + POST /api/leads + owner API behind Cloudflare Access.
// Env: ASSETS (static assets binding), DB (D1), TURNSTILE_SECRET (secret), OWNER_EMAILS (comma list),
//      ACCESS_TEAM (https://<team>.cloudflareaccess.com), ACCESS_AUD (Access app AUD tag). Missing Access config => owner area 403 (fail closed).
import { SECURITY_HEADERS } from '../lib/headers.mjs';

export const LEAD_LIMITS = { perMinute: 3, perHour: 10 };
const BAD_HEADER_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]|=\?/u;
const BAD_BODY_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\ufeff]/u;
const EMAIL_RE = /^[^\s@<>"(),;:\\[\]]+@[^\s@<>"(),;:\\[\]]+\.[^\s@<>"(),;:\\[\]]{2,}$/;
const FIELDS = { name: [2, 80, true], email: [3, 120, true], phone: [0, 25, true], service: [0, 80, true], details: [5, 4000, false] };

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export function validateLead(body) {
  if (!body || typeof body !== 'object') return { error: 'Bad request' };
  const out = { kind: 'routine' };
  for (const [k, [min, max, header]] of Object.entries(FIELDS)) {
    const v = body[k] ?? '';
    if (typeof v !== 'string') return { error: 'Invalid ' + k, field: k };
    if (v.length > max) return { error: `${k} is too long (max ${max}).`, field: k };
    if ((header ? BAD_HEADER_CHARS : BAD_BODY_CHARS).test(v)) return { error: 'Invalid characters in ' + k, field: k };
    if (v.trim().length < min) return { error: `Please fill in ${k}.`, field: k };
    out[k] = v.trim();
  }
  out.email = out.email.toLowerCase();
  if (!EMAIL_RE.test(out.email)) return { error: 'Enter a valid email.', field: 'email' };
  const d = out.phone.replace(/\D/g, '');
  if (out.phone && (d.length < 10 || d.length > 15 || !/^[0-9+().\-\s]+$/.test(out.phone))) return { error: 'Enter a valid phone number.', field: 'phone' };
  return { lead: out };
}

export async function turnstileOk(env, token, ip, fetchImpl = fetch) {
  if (!env.TURNSTILE_SECRET || !token || typeof token !== 'string' || token.length > 2048) return false; // fail closed
  const fd = new FormData(); fd.append('secret', env.TURNSTILE_SECRET); fd.append('response', token); if (ip) fd.append('remoteip', ip);
  try { const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd }); const j = await r.json(); return !!(j && j.success); } catch { return false; }
}

export async function rateLimited(db, ip, limits = LEAD_LIMITS, now = Date.now()) {
  const key = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip;
  const m = Math.floor(now / 60000), h = Math.floor(m / 60);
  let over = false;
  for (const [k, max] of [[`m|${key}|${m}`, limits.perMinute], [`h|${key}|${h}`, limits.perHour]]) {
    const row = await db.prepare('INSERT INTO lead_rate (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n').bind(k).first();
    if (row && row.n > max) over = true;
  }
  if (Math.random() < 0.05) await db.prepare('DELETE FROM lead_rate WHERE k NOT LIKE ? AND k NOT LIKE ?').bind(`m|%|${m}`, `h|%|${h}`).run();
  return over;
}

async function readCapped(req, max) {
  if (!req.body) return '';
  const reader = req.body.getReader(); const chunks = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch {} return null; } chunks.push(value); }
  const buf = new Uint8Array(n); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(buf);
}

export function csrfOk(req, origin) {
  const o = req.headers.get('Origin');
  if (o) { if (o !== origin) return false; } else if (req.headers.get('Sec-Fetch-Site') !== 'same-origin') return false;
  return /^application\/json\s*(;|$)/i.test(req.headers.get('Content-Type') || '');
}

export async function leadsApi(req, env, origin, fetchImpl) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!csrfOk(req, origin)) return json({ error: 'Forbidden' }, 403);
  if (!env.DB) return json({ error: 'Requests are not available right now. Please call us.' }, 503);
  const ip = req.headers.get('CF-Connecting-IP');
  if (!ip) return json({ error: 'Forbidden' }, 403);
  if (Number(req.headers.get('Content-Length') || 0) > 16384) return json({ error: 'Request too large' }, 413);
  const raw = await readCapped(req, 16384);
  if (raw === null) return json({ error: 'Request too large' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Bad request' }, 400); }
  if (body && typeof body.website === 'string' && body.website) return json({ ok: true }); // honeypot: fake success
  if (await rateLimited(env.DB, ip)) return json({ error: 'Too many requests. Please wait a minute or call us.' }, 429);
  if (!(await turnstileOk(env, body && body.turnstile, ip, fetchImpl))) return json({ error: 'Please complete the human check and try again.' }, 403);
  const v = validateLead(body);
  if (v.error) return json({ error: v.error, field: v.field }, 400);
  const l = v.lead;
  await env.DB.prepare('INSERT INTO leads (kind, name, email, phone, service, details) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(l.kind, l.name, l.email, l.phone, l.service, l.details).run();
  const mail = await sendLeadEmail(env, l);
  if (!mail.ok && !mail.skipped) console.error('[leads] notify failed');
  return json({ ok: true }, 201);
}

// Owner notification (DoD C2). Free: Cloudflare Email Routing send_email binding LEAD_EMAIL + vars LEAD_NOTIFY_EMAIL/LEAD_FROM_EMAIL.
// Unset => lead is still saved and shown in /owner/, no email.
export async function sendLeadEmail(env, lead) {
  const to = String(env.LEAD_NOTIFY_EMAIL || '').trim(), from = String(env.LEAD_FROM_EMAIL || '').trim();
  if (!to || !from || !env.LEAD_EMAIL || !EMAIL_RE.test(to) || !EMAIL_RE.test(from) || BAD_HEADER_CHARS.test(to + from)) return { ok: false, skipped: true };
  const text = ['New estimate request from your website', `Name: ${lead.name}`, `Email: ${lead.email}`, `Phone: ${lead.phone || '-'}`, `Service: ${lead.service || '-'}`, '', lead.details].join('\n');
  try { await env.LEAD_EMAIL.send({ to, from: { email: from, name: 'Website leads' }, replyTo: lead.email, subject: `[Estimate request] ${lead.name}`, text }); return { ok: true }; }
  catch { return { ok: false }; }
}

// ---------- path + Access ----------
export function normalizePath(raw) {
  let p = String(raw || '/');
  for (let i = 0; i < 4; i++) { let n; try { n = decodeURIComponent(p); } catch { return null; } if (n === p) break; p = n; }
  if (/%[0-9a-f]{2}/i.test(p) || /[\u0000-\u001f]/.test(p)) return null;
  p = p.replace(/\\/g, '/').replace(/;[^/]*/g, '');
  const out = [];
  for (const seg of p.split('/')) { if (seg === '' || seg === '.') continue; if (seg === '..') { out.pop(); continue; }
    const t = seg.replace(/[. ]+$/, ''); if (t) out.push(t); }
  return ('/' + out.join('/')).toLowerCase();
}
export const isProtected = (n) => n === '/owner' || n.startsWith('/owner/') || n.startsWith('/owner.') || n === '/api/owner' || n.startsWith('/api/owner/') || n.startsWith('/api/owner.');

const b64urlBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
let certCache = { keys: null, at: 0, team: '' };
export function _resetCertCache() { certCache = { keys: null, at: 0, team: '' }; }
async function getKeys(team, fetchImpl, force) {
  if (!force && certCache.keys && certCache.team === team && Date.now() - certCache.at < 600000) return certCache.keys;
  const r = await fetchImpl(`${team}/cdn-cgi/access/certs`); if (!r.ok) throw new Error('certs');
  certCache = { keys: (await r.json()).keys || [], at: Date.now(), team }; return certCache.keys;
}
export async function verifyAccessJwt(token, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const team = String(env.ACCESS_TEAM || ''), audWant = String(env.ACCESS_AUD || '');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !audWant) return null;
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.'); if (parts.length !== 3) return null;
  let header, payload; try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;
  let jwk; try { jwk = (await getKeys(team, fetchImpl, false)).find((k) => k.kid === header.kid) || (await getKeys(team, fetchImpl, true)).find((k) => k.kid === header.kid); } catch { return null; }
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)))) return null;
  } catch { return null; }
  const sec = Math.floor(now / 1000), aud = [].concat(payload.aud);
  if (!aud.includes(audWant) || payload.iss !== team || typeof payload.exp !== 'number' || payload.exp <= sec) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > sec + 60) return null;
  return payload;
}
// OWNER_EMAILS is a comma list (Big Foot #22). Empty entries or duplicates = misconfiguration = nobody (fail closed).
export function ownerAllowed(identity, env) {
  if (!identity || identity.common_name) return false; // service tokens never get the owner area
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  const allow = String(env.OWNER_EMAILS || '').split(',').map((x) => x.trim().toLowerCase());
  if (!email || allow.some((x) => !x) || new Set(allow).size !== allow.length) return false;
  return allow.includes(email);
}

function withHeaders(res, extra = {}) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(req, env, ctx, fetchImpl) {
    const url = new URL(req.url);
    if (url.protocol === 'http:' && url.hostname !== 'localhost') { url.protocol = 'https:'; return new Response(null, { status: 301, headers: { ...SECURITY_HEADERS, Location: url.toString() } }); }
    const norm = normalizePath(url.pathname);
    if (norm === null) return json({ error: 'Bad request' }, 400);
    if (isProtected(norm)) {
      const id = await verifyAccessJwt(req.headers.get('Cf-Access-Jwt-Assertion'), env, { fetchImpl: fetchImpl || fetch });
      if (!id || !ownerAllowed(id, env)) return json({ error: 'Forbidden' }, 403);
      if (norm === '/api/owner/leads') {
        if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
        if (!env.DB) return json({ error: 'Unavailable' }, 503);
        const { results } = await env.DB.prepare('SELECT id, kind, name, email, phone, service, details, status, created_at FROM leads ORDER BY id DESC LIMIT 200').all();
        return json({ leads: results || [] });
      }
      if (norm.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      return withHeaders(await env.ASSETS.fetch(req), { 'Cache-Control': 'private, no-store' });
    }
    if (norm === '/api/leads') return leadsApi(req, env, url.origin, fetchImpl || fetch);
    if (norm === '/api' || norm.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (norm === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' } });
    return withHeaders(await env.ASSETS.fetch(req));
  },
};
