// Express API + static site. createApp() is used by server/index.js and the tests.
import express from 'express'; import multer from 'multer'; import bcrypt from 'bcryptjs';
import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
import { openDb, SCHEMA } from './db.js'; import { notify, notifyStatus } from './notify.js';
import { slotsFor } from '../src/public/slots.js';
import { mountForgotLogin, turnstileOk } from './forgot-login.js';
import { makeAccessVerifier } from './owner-access.js';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// Strict CSP: no inline script; Turnstile is the only third-party script/frame. Add map/booking origins per client in site config.
export const CSP = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://www.google.com; form-action 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'";

export function cspFor(config = {}) {
  const a = config.analytics || {}; const extra = a.provider === 'plausible' ? ' https://plausible.io' : a.provider === 'ga4' ? ' https://www.googletagmanager.com https://www.google-analytics.com' : '';
  return CSP.replace("script-src 'self'", "script-src 'self'" + (a.id ? extra : '')).replace("connect-src 'self'", "connect-src 'self'" + (a.id ? extra : ''));
}

export async function createApp(opts = {}) {
  const dataDir = path.resolve(opts.dataDir || process.env.DATA_DIR || path.join(ROOT, 'data'));
  const uploadDir = path.join(dataDir, 'uploads'); fs.mkdirSync(uploadDir, { recursive: true });
  const config = opts.config || JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  const db = openDb(opts.dbFile || path.join(dataDir, 'site.db')); await db.exec(SCHEMA);
  await db.run("ALTER TABLE leads ADD COLUMN kind TEXT DEFAULT 'contact'").catch(() => {}); // older databases
  const now = opts.now || (() => new Date());

  // Owner account from env (like bigfoot's OWNER_EMAIL / OWNER_PASSWORD).
  const ownerEmail = (opts.ownerEmail ?? process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
  const ownerPass = opts.ownerPassword ?? process.env.OWNER_PASSWORD;
  if (ownerEmail && ownerPass) {
    const ex = await db.get('SELECT id FROM users WHERE email=?', [ownerEmail]);
    const hash = bcrypt.hashSync(ownerPass, 10);
    // Env seeds the owner once; a later forgot-password reset must survive restarts (set OWNER_PASSWORD_FORCE=1 to re-apply env).
    if (ex && (opts.ownerPasswordForce ?? process.env.OWNER_PASSWORD_FORCE === '1')) await db.run('UPDATE users SET password_hash=?, role=? WHERE id=?', [hash, 'owner', ex.id]);
    else if (ex) await db.run('UPDATE users SET role=? WHERE id=?', ['owner', ex.id]);
    else await db.run('INSERT INTO users(role,name,email,password_hash) VALUES(?,?,?,?)', ['owner', config.business?.name || 'Owner', ownerEmail, hash]);
  }
  if (opts.seedDemo ?? process.env.SEED_DEMO_DATA === 'true') {
    if (!(await db.get("SELECT id FROM users WHERE email='customer@demo.test'"))) await db.run('INSERT INTO users(role,name,email,password_hash) VALUES(?,?,?,?)', ['customer', 'Sample Customer', 'customer@demo.test', bcrypt.hashSync('demo-customer', 10)]);
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sample.json'), 'utf8'));
    for (const k of ['projects', 'posts']) await db.run('INSERT OR IGNORE INTO content(key,value) VALUES(?,?)', [k, JSON.stringify(c[k])]);
  }

  // Owner = Cloudflare Access + OWNER_EMAILS (QA L3). OWNER_EMAIL/OWNER_PASSWORD only seed the account row; the
  // password alone never grants owner. Tests inject opts.verifyOwnerAccess.
  const verifyOwnerAccess = opts.verifyOwnerAccess || makeAccessVerifier({ teamDomain: process.env.ACCESS_TEAM_DOMAIN, aud: process.env.ACCESS_AUD, ownerEmails: process.env.OWNER_EMAILS || process.env.OWNER_EMAIL, fetchImpl: opts.fetchImpl || fetch });
  const loginTurnstileSecret = opts.turnstileSecret ?? process.env.TURNSTILE_SECRET;
  const loginTurnstile = opts.loginTurnstile ?? true; // fail closed; tests may pass false
  const ownerOk = async (req, u) => { const e = await verifyOwnerAccess(req); return !!e && e === String(u.email).toLowerCase(); };

  const app = express();
  app.locals.settleForgot = () => (fl ? fl.settle() : Promise.resolve());
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': cspFor(config) }); next(); });
  const fl = await mountForgotLogin(app, { db, publicOrigin: opts.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? config.siteUrl, siteName: config.business?.name || 'your account', fetchImpl: opts.fetchImpl || fetch, turnstileSecret: opts.turnstileSecret ?? process.env.TURNSTILE_SECRET, sendEmail: opts.sendEmail, now: opts.nowMs,
    users: { findByEmail: (e) => db.get("SELECT id, email FROM users WHERE email=? AND role != 'owner'", [e]), findById: (id) => db.get("SELECT id, email, role FROM users WHERE id=?", [id]), setPassword: (id, pw) => db.run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(pw, 10), id]), revokeSessions: (id) => db.run('DELETE FROM sessions WHERE user_id=?', [id]) } });
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const bad = (res, code, error) => res.status(code).json({ error });
  const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

  // tiny in-memory rate limiter for public endpoints
  // In-memory counters are size-capped (oldest-touched evicted first) so a flood of keys can't exhaust memory (QA r3 P3).
  const MAP_CAP = opts.mapCap || 10000;
  const capSet = (m, k, v) => { m.delete(k); m.set(k, v); while (m.size > MAP_CAP) m.delete(m.keys().next().value); };
  // Client IP: Cloudflare's CF-Connecting-IP, else the socket address (never X-Forwarded-For, which is client-set).
  const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || '').slice(0, 64);
  app.locals.counterSizes = () => ({ hits: hits.size, fails: fails.size, acctFails: acctFails.size });
  const hits = new Map();
  const limit = (n, ms) => (req, res, next) => { if (opts.noRateLimit) return next(); const k = clientIp(req) + '|' + req.path; const t = Date.now(); const a = (hits.get(k) || []).filter((x) => t - x < ms); a.push(t); capSet(hits, k, a); a.length > n ? bad(res, 429, 'Too many requests, try again later') : next(); };

  // --- auth ---
  const auth = (role) => wrap(async (req, res, next) => {
    const tok = (req.get('authorization') || '').replace(/^Bearer /, '');
    const row = tok && await db.get("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires > datetime('now')", [tok]);
    if (!row) return bad(res, 401, 'Please log in');
    if (row.role === 'owner' && !(await ownerOk(req, row))) return bad(res, 403, 'Owner access requires Cloudflare Access');
    if (role && row.role !== role) return bad(res, 403, 'Not allowed');
    req.user = row; req.token = tok; next();
  });
  const optionalUser = wrap(async (req, _res, next) => { const tok = (req.get('authorization') || '').replace(/^Bearer /, ''); req.user = tok ? await db.get("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires > datetime('now')", [tok]) : null; next(); });
  const pubUser = (u) => ({ id: String(u.id), role: u.role, name: u.name, email: u.email });
  const scope = (req) => (req.user.role === 'owner' ? ['1=1', []] : ['customer_id=?', [req.user.id]]);

  app.get('/api/health', (_req, res) => res.json({ ok: true, notifications: notifyStatus() }));
  // Login: honeypot, Turnstile (fail closed), per-IP limit, per-account+IP lockout (5 bad tries -> 15 min),
  // constant-ish work for unknown emails (dummy bcrypt compare), owner needs Access + OWNER_EMAILS.
  const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
  const fails = new Map(); const LOCK_N = 5, LOCK_MS = 15 * 60e3;
  // Per-account lockout across all IPs (QA r2 P3): rotating IPs can't bypass it. Higher threshold so one IP can't
  // trivially lock a real user out; Turnstile still applies on every try.
  const acctFails = new Map(); const ACCT_LOCK_N = opts.acctLockN || 10;
  app.post('/api/auth/login', limit(10, 60000), wrap(async (req, res) => {
    const ip = clientIp(req);
    if (typeof req.body.website === 'string' && req.body.website) return bad(res, 401, 'Wrong email or password');
    if (loginTurnstile && !(await turnstileOk(loginTurnstileSecret, req.body.turnstile, ip, opts.fetchImpl || fetch))) return bad(res, 403, 'Please complete the human check and try again.');
    const email = str(req.body.email, 200).toLowerCase();
    const lk = crypto.createHash('sha256').update(email + '|' + ip).digest('hex'); const t = Date.now();
    const f = (fails.get(lk) || []).filter((x) => t - x < LOCK_MS);
    const ak = crypto.createHash('sha256').update('acct|' + email).digest('hex');
    const af = (acctFails.get(ak) || []).filter((x) => t - x < LOCK_MS);
    // Access is checked first (QA r3 P2b): an Access-verified owner signing in as themself is never locked out by
    // attackers spraying their email; every lock decision is logged (hashed key only, no email/IP).
    const accessEmail = await verifyOwnerAccess(req);
    const ownerViaAccess = !!accessEmail && accessEmail === email;
    if (f.length >= LOCK_N || af.length >= ACCT_LOCK_N) {
      if (ownerViaAccess) console.warn('[login] lockout bypassed for Access-verified owner', ak.slice(0, 12));
      else { console.warn('[login] lockout triggered', ak.slice(0, 12), f.length >= LOCK_N ? 'email+ip' : 'account'); return bad(res, 429, 'Too many attempts. Try again in 15 minutes.'); }
    }
    const u = await db.get('SELECT * FROM users WHERE email=?', [email]);
    const pwOk = bcrypt.compareSync(String(req.body.password || ''), u ? u.password_hash : DUMMY_HASH);
    if (!u || !pwOk) { f.push(t); capSet(fails, lk, f); af.push(t); capSet(acctFails, ak, af); return bad(res, 401, 'Wrong email or password'); }
    if (u.role === 'owner' && !(ownerViaAccess && accessEmail === String(u.email).toLowerCase())) return bad(res, 403, 'Owner sign-in is only available through Cloudflare Access.');
    fails.delete(lk); acctFails.delete(ak);
    const token = crypto.randomBytes(32).toString('hex');
    await db.run("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,datetime('now','+14 days'))", [token, u.id]);
    res.json({ token, user: pubUser(u) });
  }));
  app.post('/api/auth/logout', auth(), wrap(async (req, res) => { await db.run('DELETE FROM sessions WHERE token=?', [req.token]); res.json({ ok: true }); }));
  app.get('/api/auth/me', auth(), (req, res) => res.json({ user: pubUser(req.user) }));

  // --- customers (owner) ---
  app.get('/api/customers', auth('owner'), wrap(async (_req, res) => res.json((await db.all("SELECT * FROM users WHERE role='customer' ORDER BY name")).map(pubUser))));
  app.post('/api/customers', auth('owner'), wrap(async (req, res) => {
    const name = str(req.body.name, 200), email = str(req.body.email, 200).toLowerCase(), pw = String(req.body.password || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 8) return bad(res, 400, 'Name, a valid email and a password of 8+ characters are required');
    if (await db.get('SELECT id FROM users WHERE email=?', [email])) return bad(res, 409, 'Email already used');
    const r = await db.run('INSERT INTO users(role,name,email,phone,password_hash) VALUES(?,?,?,?,?)', ['customer', name, email, str(req.body.phone, 40), bcrypt.hashSync(pw, 10)]);
    res.status(201).json({ id: String(r.id), role: 'customer', name, email });
  }));

  // Owner re-invite: single-use 48h set-password link for a customer (owner accounts can't be invited).
  app.post('/api/customers/:id/invite', auth('owner'), wrap(async (req, res) => {
    const r = await fl.createInvite(Number(req.params.id));
    if (!r) return bad(res, 404, 'Customer not found');
    res.set('Cache-Control', 'no-store').json({ link: r.link, expiresAt: new Date(r.expiresAt).toISOString() });
  }));

  // --- leads ---
  const mapLead = (l) => ({ ...l, id: String(l.id) });
  app.post('/api/leads', limit(5, 60000), wrap(async (req, res) => {
    if (req.body.website) return res.status(201).json({ ok: true }); // honeypot
    const d = { kind: ['contact', 'quote', 'order', 'booking'].includes(req.body.kind) ? req.body.kind : 'contact', name: str(req.body.name, 200), phone: str(req.body.phone, 40), email: str(req.body.email, 200), service: str(req.body.service, 200), address: str(req.body.address, 300), message: str(req.body.message) };
    if (!d.name || !d.phone || !d.message) return bad(res, 400, 'Name, phone and message are required');
    const r = await db.run('INSERT INTO leads(kind,name,phone,email,service,address,message) VALUES(?,?,?,?,?,?,?)', Object.values(d));
    notify('lead.created', d); res.status(201).json({ id: String(r.id) });
  }));
  app.get('/api/leads', auth('owner'), wrap(async (_req, res) => res.json((await db.all('SELECT * FROM leads ORDER BY id DESC')).map(mapLead))));
  app.patch('/api/leads/:id', auth('owner'), wrap(async (req, res) => {
    if (!['new', 'contacted', 'quoted', 'won', 'lost'].includes(req.body.status)) return bad(res, 400, 'Bad status');
    await db.run('UPDATE leads SET status=? WHERE id=?', [req.body.status, req.params.id]); res.json({ ok: true });
  }));

  // --- bookings ---
  const taken = async (date) => (await db.all("SELECT time FROM bookings WHERE date=? AND status!='cancelled'", [date])).map((r) => r.time);
  const mapBk = (b) => ({ ...b, id: String(b.id), customerId: b.customer_id ? String(b.customer_id) : null });
  app.get('/api/bookings/availability', wrap(async (req, res) => res.json(slotsFor(str(req.query.date, 10), config.booking, await taken(str(req.query.date, 10)), now()))));
  app.post('/api/bookings', limit(5, 60000), optionalUser, wrap(async (req, res) => {
    const d = { date: str(req.body.date, 10), time: str(req.body.time, 5), service: str(req.body.service, 200), name: str(req.body.name, 200), phone: str(req.body.phone, 40), email: str(req.body.email, 200), notes: str(req.body.notes) };
    if (!d.name || !d.phone) return bad(res, 400, 'Name and phone are required');
    const slot = slotsFor(d.date, config.booking, await taken(d.date), now()).find((s) => s.time === d.time);
    if (!slot || !slot.available) return bad(res, 409, 'That time is not available');
    try { const r = await db.run('INSERT INTO bookings(date,time,service,name,phone,email,notes,customer_id) VALUES(?,?,?,?,?,?,?,?)', [...Object.values(d), req.user?.role === 'customer' ? req.user.id : null]);
      notify('booking.created', d); res.status(201).json({ id: String(r.id), status: 'pending' }); }
    catch (e) { if (/UNIQUE/.test(e.message)) return bad(res, 409, 'That time is not available'); throw e; }
  }));
  app.get('/api/bookings', auth(), wrap(async (req, res) => { const [w, p] = scope(req); res.json((await db.all(`SELECT * FROM bookings WHERE ${w} ORDER BY date, time`, p)).map(mapBk)); }));
  app.patch('/api/bookings/:id', auth('owner'), wrap(async (req, res) => {
    if (!['pending', 'confirmed', 'cancelled', 'done'].includes(req.body.status)) return bad(res, 400, 'Bad status');
    const b = await db.get('SELECT * FROM bookings WHERE id=?', [req.params.id]); if (!b) return bad(res, 404, 'Not found');
    await db.run('UPDATE bookings SET status=? WHERE id=?', [req.body.status, b.id]);
    notify('booking.updated', { ...b, status: req.body.status }, { email: b.email, phone: b.phone }); res.json({ ok: true });
  }));

  // --- quotes & invoices ---
  const cleanLines = (lines) => (Array.isArray(lines) ? lines : []).slice(0, 100).map((l) => ({ desc: str(l.desc, 300), qty: Math.max(0, Number(l.qty) || 0), unit: Math.max(0, Math.round(Number(l.unit) || 0)) })).filter((l) => l.desc);
  const mapQ = (q) => ({ id: String(q.id), customerId: String(q.customer_id), title: q.title, lines: JSON.parse(q.lines || '[]'), notes: q.notes, status: q.status, created: q.created });
  const customerOf = (id) => db.get("SELECT * FROM users WHERE id=? AND role='customer'", [id]);
  app.get('/api/quotes', auth(), wrap(async (req, res) => { const [w, p] = scope(req); const extra = req.user.role === 'owner' ? '' : " AND status!='draft'"; res.json((await db.all(`SELECT * FROM quotes WHERE ${w}${extra} ORDER BY id DESC`, p)).map(mapQ)); }));
  app.post('/api/quotes', auth('owner'), wrap(async (req, res) => {
    const c = await customerOf(req.body.customerId); const lines = cleanLines(req.body.lines); const status = req.body.status === 'sent' ? 'sent' : 'draft';
    if (!c || !str(req.body.title) || !lines.length) return bad(res, 400, 'Customer, title and at least one line item are required');
    const r = await db.run('INSERT INTO quotes(customer_id,title,lines,notes,status) VALUES(?,?,?,?,?)', [c.id, str(req.body.title, 200), JSON.stringify(lines), str(req.body.notes), status]);
    if (status === 'sent') notify('quote.sent', { title: req.body.title }, c);
    res.status(201).json(mapQ(await db.get('SELECT * FROM quotes WHERE id=?', [r.id])));
  }));
  app.patch('/api/quotes/:id', auth(), wrap(async (req, res) => {
    const q = await db.get('SELECT * FROM quotes WHERE id=?', [req.params.id]); if (!q) return bad(res, 404, 'Not found');
    const s = req.body.status;
    if (req.user.role === 'customer') {
      if (q.customer_id !== req.user.id || q.status !== 'sent' || !['accepted', 'declined'].includes(s)) return bad(res, 403, 'Not allowed');
    } else if (!['draft', 'sent', 'accepted', 'declined', 'invoiced'].includes(s)) return bad(res, 400, 'Bad status');
    await db.run('UPDATE quotes SET status=? WHERE id=?', [s, q.id]);
    if (s === 'sent' && q.status !== 'sent') notify('quote.sent', q, await customerOf(q.customer_id));
    res.json({ ok: true });
  }));
  const mapI = (i) => ({ id: String(i.id), customerId: String(i.customer_id), quoteId: i.quote_id ? String(i.quote_id) : null, title: i.title, amount: i.amount, status: i.status, created: i.created });
  app.get('/api/invoices', auth(), wrap(async (req, res) => { const [w, p] = scope(req); res.json((await db.all(`SELECT * FROM invoices WHERE ${w} ORDER BY id DESC`, p)).map(mapI)); }));
  app.post('/api/invoices', auth('owner'), wrap(async (req, res) => {
    const c = await customerOf(req.body.customerId); const amount = Math.round(Number(req.body.amount));
    if (!c || !str(req.body.title) || !(amount > 0)) return bad(res, 400, 'Customer, title and a positive amount (cents) are required');
    const r = await db.run('INSERT INTO invoices(customer_id,quote_id,title,amount) VALUES(?,?,?,?)', [c.id, req.body.quoteId || null, str(req.body.title, 200), amount]);
    res.status(201).json(mapI(await db.get('SELECT * FROM invoices WHERE id=?', [r.id])));
  }));
  app.patch('/api/invoices/:id', auth('owner'), wrap(async (req, res) => { if (!['unpaid', 'paid', 'void'].includes(req.body.status)) return bad(res, 400, 'Bad status'); await db.run('UPDATE invoices SET status=? WHERE id=?', [req.body.status, req.params.id]); res.json({ ok: true }); }));

  // --- jobs (project status) & photo uploads ---
  const mapJ = (j) => ({ id: String(j.id), customerId: String(j.customer_id), title: j.title, status: j.status, progress: j.progress, notes: j.notes });
  app.get('/api/jobs', auth(), wrap(async (req, res) => { const [w, p] = scope(req); res.json((await db.all(`SELECT * FROM jobs WHERE ${w} ORDER BY id DESC`, p)).map(mapJ)); }));
  app.post('/api/jobs', auth('owner'), wrap(async (req, res) => { const c = await customerOf(req.body.customerId); if (!c || !str(req.body.title)) return bad(res, 400, 'Customer and title are required'); const r = await db.run('INSERT INTO jobs(customer_id,title) VALUES(?,?)', [c.id, str(req.body.title, 200)]); res.status(201).json(mapJ(await db.get('SELECT * FROM jobs WHERE id=?', [r.id]))); }));
  app.patch('/api/jobs/:id', auth('owner'), wrap(async (req, res) => {
    const j = await db.get('SELECT * FROM jobs WHERE id=?', [req.params.id]); if (!j) return bad(res, 404, 'Not found');
    await db.run('UPDATE jobs SET status=?, progress=?, notes=? WHERE id=?', [str(req.body.status ?? j.status, 60), Math.max(0, Math.min(100, Number(req.body.progress ?? j.progress) || 0)), str(req.body.notes ?? j.notes), j.id]); res.json({ ok: true });
  }));
  const jobFor = async (req) => { const j = await db.get('SELECT * FROM jobs WHERE id=?', [req.params.id]); return j && (req.user.role === 'owner' || j.customer_id === req.user.id) ? j : null; };
  const IMG = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (_r, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${IMG[f.mimetype]}`) }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_r, f, cb) => (IMG[f.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Images only (jpg, png, webp, gif)'), { status: 415 }))) });
  app.get('/api/jobs/:id/photos', auth(), wrap(async (req, res) => { const j = await jobFor(req); if (!j) return bad(res, 404, 'Not found'); res.json((await db.all('SELECT * FROM photos WHERE job_id=? ORDER BY id', [j.id])).map((p) => ({ id: String(p.id), url: `/api/files/${p.file}`, by: p.by_role, at: p.created }))); }));
  app.post('/api/jobs/:id/photos', auth(), wrap(async (req, res, next) => { const j = await jobFor(req); if (!j) return bad(res, 404, 'Not found'); req.job = j; next(); }), upload.single('photo'), wrap(async (req, res) => {
    if (!req.file) return bad(res, 400, 'No photo uploaded');
    const r = await db.run('INSERT INTO photos(job_id,file,by_role) VALUES(?,?,?)', [req.job.id, req.file.filename, req.user.role]); res.status(201).json({ id: String(r.id), url: `/api/files/${req.file.filename}` });
  }));
  // Job photos are private: served only to the owner or that job's customer (token in header or ?t= for <img>).
  app.get('/api/files/:file', wrap(async (req, res) => {
    const file = path.basename(req.params.file); const tok = (req.get('authorization') || '').replace(/^Bearer /, '') || String(req.query.t || '');
    const ph = await db.get('SELECT p.*, j.customer_id FROM photos p JOIN jobs j ON j.id=p.job_id WHERE p.file=?', [file]);
    const pub = !ph && await db.get("SELECT 1 FROM content WHERE key='uploads' AND value LIKE ?", [`%"${file}"%`]);
    if (!pub) { const u = tok && await db.get("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires > datetime('now')", [tok]);
      if (!ph || !u || (u.role !== 'owner' && u.id !== ph.customer_id)) return bad(res, 404, 'Not found'); }
    res.sendFile(path.join(uploadDir, file));
  }));
  // Public gallery images uploaded from the admin dashboard.
  app.post('/api/content/upload', auth('owner'), upload.single('photo'), wrap(async (req, res) => {
    if (!req.file) return bad(res, 400, 'No photo uploaded');
    const row = await db.get("SELECT value FROM content WHERE key='uploads'"); const list = row ? JSON.parse(row.value) : []; list.push(req.file.filename);
    await db.run("INSERT INTO content(key,value) VALUES('uploads',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [JSON.stringify(list)]);
    res.status(201).json({ url: `/api/files/${req.file.filename}` });
  }));

  // --- messages ---
  app.get('/api/messages', auth(), wrap(async (req, res) => {
    const cid = req.user.role === 'owner' ? req.query.customerId : req.user.id;
    const rows = cid ? await db.all('SELECT * FROM messages WHERE customer_id=? ORDER BY id', [cid]) : await db.all('SELECT * FROM messages ORDER BY id');
    res.json(rows.map((m) => ({ id: String(m.id), customerId: String(m.customer_id), from: m.sender, body: m.body, at: m.created.replace(' ', 'T') + 'Z' })));
  }));
  app.post('/api/messages', auth(), wrap(async (req, res) => {
    const body = str(req.body.body, 5000); if (!body) return bad(res, 400, 'Message is empty');
    const c = req.user.role === 'owner' ? await customerOf(req.body.customerId) : req.user; if (!c) return bad(res, 400, 'Pick a customer');
    const r = await db.run('INSERT INTO messages(customer_id,sender,body) VALUES(?,?,?)', [c.id, req.user.role, body]);
    notify('message.created', { from: req.user.role, body }, c); res.status(201).json({ id: String(r.id) });
  }));

  // --- editable site content ---
  const KEYS = ['site', 'projects', 'posts'];
  app.get('/api/content', wrap(async (_req, res) => { const out = { site: {}, projects: [], posts: [] }; for (const r of await db.all('SELECT * FROM content')) if (KEYS.includes(r.key)) out[r.key] = JSON.parse(r.value); res.json(out); }));
  app.put('/api/content/:key', auth('owner'), wrap(async (req, res) => {
    if (!KEYS.includes(req.params.key)) return bad(res, 404, 'Unknown content key');
    const v = req.body.value; if (req.params.key === 'site' ? typeof v !== 'object' || Array.isArray(v) : !Array.isArray(v)) return bad(res, 400, 'Bad value');
    await db.run('INSERT INTO content(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [req.params.key, JSON.stringify(v)]); res.json({ ok: true });
  }));

  // Owner UI shell (/admin/) is served ONLY by this handler, behind Cloudflare Access + OWNER_EMAILS (QA r2 B2, r3 P2a).
  // The public static handler never sees dist/admin: paths are decoded (repeatedly), backslashes/duplicate slashes
  // collapsed and dot-segments resolved before matching, so //admin/, /%61dmin/, /%2Fadmin/, /admin%2findex.html and
  // /./admin/ all route here. No Access -> plain 404, no-store.
  const dist = opts.staticDir || path.join(ROOT, 'dist');
  const adminDir = path.join(dist, 'admin');
  const normPath = (raw) => {
    let p = String(raw || '/').split('?')[0];
    for (let i = 0; i < 5; i++) { let d; try { d = decodeURIComponent(p); } catch { return null; } if (d === p) break; p = d; }
    p = p.replace(/\0/g, '').replace(/;[^/]*/g, '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    return path.posix.normalize('/' + p).toLowerCase();
  };
  const isAdmin = (n) => n === null || n === '/admin' || n.startsWith('/admin/') || n === '/admin.html' || n.startsWith('/admin.');
  const notFound = (res) => res.set('Cache-Control', 'no-store').status(404).type('text').send('Not found');
  app.use(wrap(async (req, res, next) => {
    const n = normPath(req.originalUrl || req.url);
    if (!isAdmin(n)) return next();
    if (n === null) return res.set('Cache-Control', 'no-store').status(400).type('text').send('Bad request');
    if (!(await verifyOwnerAccess(req))) return notFound(res);
    let rel = n === '/admin' || n === '/admin.html' ? 'index.html' : n.slice('/admin/'.length) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(adminDir, rel), file2 = file + '.html';
    if (!file.startsWith(adminDir + path.sep)) return notFound(res);
    const pick = [file, file2, path.join(file, 'index.html')].find((f) => f.startsWith(adminDir + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!pick) return notFound(res);
    res.set('Cache-Control', 'no-store'); res.sendFile(pick);
  }));

  // --- static site (built by `npm run build`) --- (admin/ excluded above; also refused here as a backstop)
  if (fs.existsSync(dist)) app.use((req, res, next) => (isAdmin(normPath(req.originalUrl || req.url)) ? notFound(res) : next()), express.static(dist, { extensions: ['html'], maxAge: '1h' }));
  app.use('/api', (_req, res) => bad(res, 404, 'Not found'));
  app.use((err, _req, res, _next) => { const code = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500); if (code === 500) console.error(err); bad(res, code, code === 500 ? 'Server error' : err.message); });
  app.locals.db = db;
  return app;
}
