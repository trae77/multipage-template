// Forgot-password / reset flow, ported from Big Foot (trae77/bigfootConstruction PR #24).
// Token: 32 random bytes, stored only as SHA-256, single use (atomic claim), 30-min expiry, link carries it in the
// URL fragment. Turnstile (fails closed) + honeypot + per-IP and per-email limits. Identical reply for any email.
// Reset revokes every session for the account and writes an auth_audit row (hashed IP only).
import crypto from 'node:crypto';

export const RESET_TTL_MS = 30 * 60 * 1000;
export const LIMITS = { ipPerMin: 3, ipPerHour: 10, emailPerHour: 3, badTokenPerIpPer15m: 10 };
export const FORGOT_OK = 'If that email has an account, a reset link is on its way. It expires in 30 minutes.';
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id, created_at);
CREATE TABLE IF NOT EXISTS auth_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, user_id INTEGER, ip_hash TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL);
`;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export async function turnstileOk(secret, token, ip, fetchImpl = fetch) {
  if (!secret || !token || typeof token !== 'string' || token.length > 2048) return false;
  const fd = new FormData(); fd.append('secret', secret); fd.append('response', token); if (ip) fd.append('remoteip', ip);
  try { const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd }); return !!(await r.json()).success; } catch { return false; }
}

// EMAIL_SENDER=resend (RESEND_API_KEY + EMAIL_FROM) or stub (default; logs a redacted line, never the link).
export function defaultSender(env = process.env, fetchImpl = fetch, log = console.log) {
  return async ({ to, subject, text }) => {
    if ((env.EMAIL_SENDER || 'stub') === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM) {
      try { const r = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }) }); return { delivered: r.ok, provider: 'resend' }; } catch { return { delivered: false, provider: 'resend' }; }
    }
    log(`[email-stub] reset for ${String(to).replace(/^(.).*(@.*)$/, '$1***$2')} not delivered (no provider configured)`);
    return { delivered: false, provider: 'stub' };
  };
}

// db: { exec(sql), run(sql, params), get(sql, params) } (promise-based).
// users: { findByEmail(email) -> {id,email}|null, setPassword(id, plain), revokeSessions(id) }.
export async function mountForgotLogin(app, o) {
  const { db, users, publicOrigin, resetPath = '/reset-password', siteName = 'your account', apiBase = '/api/auth',
    turnstileSecret = process.env.TURNSTILE_SECRET, fetchImpl = fetch, now = () => Date.now(), minPassword = 12 } = o;
  const send = o.sendEmail || defaultSender(process.env, fetchImpl);
  await db.exec(SCHEMA);
  const ipOf = (req) => req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || '';
  const audit = (event, uid, ip) => db.run('INSERT INTO auth_audit (event, user_id, ip_hash, created_at) VALUES (?, ?, ?, ?)', [event, uid || null, ip ? sha('ip:' + ip) : null, now()]);
  async function bump(key, windowMs) {
    const t = now(), k = sha(key) + ':' + Math.floor(t / windowMs);
    await db.run('INSERT INTO auth_rate (k, n, exp) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1', [k, t + windowMs]);
    if (Math.random() < 0.05) await db.run('DELETE FROM auth_rate WHERE exp < ?', [t]);
    return (await db.get('SELECT n FROM auth_rate WHERE k = ?', [k])).n;
  }
  const peek = async (key, windowMs) => { const r = await db.get('SELECT n FROM auth_rate WHERE k = ?', [sha(key) + ':' + Math.floor(now() / windowMs)]); return r ? r.n : 0; };
  const sameOrigin = (req) => { const og = req.headers.origin; return !og || !publicOrigin || og === new URL(publicOrigin).origin; };

  const siteKey = o.turnstileSiteKey ?? process.env.TURNSTILE_SITE_KEY ?? '';
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="stylesheet" href="${apiBase}/forgot-login.css"></head><body><main class="fl"><h1>${esc(title)}</h1>${body}<p id="fl-msg" role="status"></p></main><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><script src="${apiBase}/forgot-login.js" defer></script></body></html>`;
  const ts = `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}"></div><input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="fl-hp">`;
  const noStore = (res) => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  app.get(o.forgotPath || '/forgot-password', (_q, res) => noStore(res).type('html').send(page('Forgot your password?', `<form id="fl-forgot" data-api="${apiBase}/forgot"><label>Email<input type="email" name="email" autocomplete="email" maxlength="254" required></label>${ts}<button>Email me a reset link</button></form>`)));
  app.get(resetPath, (_q, res) => noStore(res).type('html').send(page('Choose a new password', `<form id="fl-reset" data-api="${apiBase}/reset" data-min="${minPassword}"><label>New password<input type="password" name="password" autocomplete="new-password" minlength="${minPassword}" maxlength="128" required></label><label>Confirm<input type="password" name="confirm" autocomplete="new-password" required></label>${ts}<button>Save password</button><p>Saving signs you out everywhere.</p></form>`)));
  app.get(`${apiBase}/forgot-login.css`, (_q, res) => res.type('css').send('.fl{max-width:28rem;margin:3rem auto;padding:0 1rem;font:16px/1.5 system-ui,sans-serif}.fl label{display:block;margin:.75rem 0}.fl input{display:block;width:100%;box-sizing:border-box;padding:.6rem;font:inherit}.fl button{margin-top:1rem;padding:.7rem 1.2rem;font:inherit}.fl-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}.cf-turnstile{max-width:100%;overflow:hidden}'));
  app.get(`${apiBase}/forgot-login.js`, (_q, res) => res.type('js').send(`(function(){var m=document.getElementById('fl-msg');function tok(f){var i=f.querySelector('[name="cf-turnstile-response"]');return i?i.value:''}
function post(f,body){return fetch(f.dataset.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})}
var a=document.getElementById('fl-forgot');if(a)a.addEventListener('submit',function(e){e.preventDefault();post(a,{email:a.email.value,website:a.website.value,turnstile:tok(a)}).then(function(r){m.textContent=r.j.message||r.j.error;if(r.ok)a.hidden=true;else if(window.turnstile)turnstile.reset()})});
var b=document.getElementById('fl-reset');if(b){var t=new URLSearchParams(location.hash.slice(1)).get('token')||'';if(!t){m.textContent='This link is missing its reset code. Request a new link.';b.hidden=true}
b.addEventListener('submit',function(e){e.preventDefault();if(b.password.value.length<+b.dataset.min){m.textContent='Password is too short.';return}if(b.password.value!==b.confirm.value){m.textContent='Passwords do not match.';return}
post(b,{token:t,password:b.password.value,website:b.website.value,turnstile:tok(b)}).then(function(r){if(r.ok){history.replaceState(null,'',location.pathname);b.hidden=true;m.textContent='Password saved. You can sign in now.'}else{m.textContent=r.j.error;if(window.turnstile)turnstile.reset()}})})}})();`));

  app.post(`${apiBase}/forgot`, async (req, res, next) => { try {
    const b = req.body || {}, ip = ipOf(req);
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    if (typeof b.website === 'string' && b.website) return res.json({ ok: true, message: FORGOT_OK });
    if ((await bump('fm:' + ip, 60e3)) > LIMITS.ipPerMin || (await bump('fh:' + ip, 3600e3)) > LIMITS.ipPerHour) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
    if (!(await turnstileOk(turnstileSecret, b.turnstile, ip, fetchImpl))) return res.status(403).json({ error: 'Please complete the human check and try again.' });
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 254) : '';
    const ok = () => res.json({ ok: true, message: FORGOT_OK });
    const token = crypto.randomBytes(32).toString('base64url'), h = sha(token);
    const u = email ? await users.findByEmail(email) : null;
    if (!u) { if (email) await audit('reset_unknown_email', null, ip); return ok(); }
    const t = now();
    const recent = await db.get('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?', [u.id, t - 3600e3]);
    if (recent.n >= LIMITS.emailPerHour) { await audit('reset_throttled', u.id, ip); return ok(); }
    await db.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [t, u.id]);
    await db.run('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)', [u.id, h, t + RESET_TTL_MS, t]);
    const link = `${String(publicOrigin || '').replace(/\/$/, '')}${resetPath}#token=${token}`;
    await send({ to: u.email, subject: `Reset your ${siteName} password`, text: `Someone asked to reset your ${siteName} password.\n\nUse this link within 30 minutes (it works once):\n${link}\n\nIf this wasn't you, ignore this email.` });
    await audit('reset_requested', u.id, ip);
    return ok();
  } catch (e) { next(e); } });

  app.post(`${apiBase}/reset`, async (req, res, next) => { try {
    const b = req.body || {}, ip = ipOf(req);
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    const badKey = 'rb:' + ip;
    if ((await peek(badKey, 15 * 60e3)) >= LIMITS.badTokenPerIpPer15m) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const bad = async () => { await bump(badKey, 15 * 60e3); await audit('reset_rejected', null, ip); return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' }); };
    if (typeof b.website === 'string' && b.website) return bad();
    if (!(await turnstileOk(turnstileSecret, b.turnstile, ip, fetchImpl))) return res.status(403).json({ error: 'Please complete the human check and try again.' });
    const pw = typeof b.password === 'string' ? b.password : '';
    if (pw.length < minPassword || pw.length > 128) return res.status(400).json({ error: `Password must be ${minPassword}-128 characters.` });
    const token = String(b.token || '');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return bad();
    const h = sha(token);
    const row = await db.get('SELECT id, user_id, token_hash, expires_at, used_at FROM password_resets WHERE token_hash = ?', [h]);
    if (!row || !crypto.timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(h)) || row.used_at || row.expires_at <= now()) return bad();
    const claim = await db.run('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL', [now(), row.id]);
    if (!claim || claim.changes !== 1) return bad();
    await users.setPassword(row.user_id, pw);
    await users.revokeSessions(row.user_id);
    await db.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [now(), row.user_id]);
    await audit('reset_completed', row.user_id, ip);
    return res.json({ ok: true });
  } catch (e) { next(e); } });
}
