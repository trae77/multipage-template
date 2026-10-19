// Front-end for public pages, booking, quote form, customer portal and owner dashboard.
// window.SITE.mode === 'demo' -> DemoStore (localStorage, no server). Otherwise ApiStore (/api).
import { esc, md } from './md.js';
import { slotsFor, isValidSlot } from './slots.js';
const SITE = window.SITE || {}; const ROOT = document.body.dataset.root || '/';
const $ = (s, el = document) => el.querySelector(s); const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (c) => '$' + (Number(c || 0) / 100).toFixed(2);
const total = (lines) => (lines || []).reduce((t, l) => t + Math.round(Number(l.qty || 0) * Number(l.unit || 0)), 0);
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

// ------------------------------------------------------------------ API store
class ApiStore {
  get token() { return localStorage.getItem('mp_token'); }
  async req(method, path, body, isForm) {
    const h = {}; if (this.token) h.Authorization = 'Bearer ' + this.token; if (body && !isForm) h['Content-Type'] = 'application/json';
    const r = await fetch('/api' + path, { method, headers: h, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }
  async login(email, password) { const d = await this.req('POST', '/auth/login', { email, password }); localStorage.setItem('mp_token', d.token); return d.user; }
  async logout() { await this.req('POST', '/auth/logout').catch(() => {}); localStorage.removeItem('mp_token'); }
  me() { return this.token ? this.req('GET', '/auth/me').then((d) => d.user).catch(() => null) : Promise.resolve(null); }
  createLead(d) { return this.req('POST', '/leads', d); } listLeads() { return this.req('GET', '/leads'); } updateLead(id, p) { return this.req('PATCH', '/leads/' + id, p); }
  availability(date) { return this.req('GET', '/bookings/availability?date=' + encodeURIComponent(date)); }
  createBooking(d) { return this.req('POST', '/bookings', d); } listBookings() { return this.req('GET', '/bookings'); } updateBooking(id, p) { return this.req('PATCH', '/bookings/' + id, p); }
  listCustomers() { return this.req('GET', '/customers'); } createCustomer(d) { return this.req('POST', '/customers', d); }
  listQuotes() { return this.req('GET', '/quotes'); } createQuote(d) { return this.req('POST', '/quotes', d); } updateQuote(id, p) { return this.req('PATCH', '/quotes/' + id, p); }
  listInvoices() { return this.req('GET', '/invoices'); } createInvoice(d) { return this.req('POST', '/invoices', d); } updateInvoice(id, p) { return this.req('PATCH', '/invoices/' + id, p); }
  listJobs() { return this.req('GET', '/jobs'); } createJob(d) { return this.req('POST', '/jobs', d); } updateJob(id, p) { return this.req('PATCH', '/jobs/' + id, p); }
  async listPhotos(jobId) { return (await this.req('GET', `/jobs/${jobId}/photos`)).map((x) => ({ ...x, url: x.url + '?t=' + encodeURIComponent(this.token) })); }
  uploadPhoto(jobId, file) { const f = new FormData(); f.append('photo', file); return this.req('POST', `/jobs/${jobId}/photos`, f, true); }
  listMessages(customerId) { return this.req('GET', '/messages' + (customerId ? '?customerId=' + customerId : '')); }
  sendMessage(d) { return this.req('POST', '/messages', d); }
  getContent() { return this.req('GET', '/content'); } saveContent(key, value) { return this.req('PUT', '/content/' + key, { value }); }
}

// ------------------------------------------------------------------ Demo store (localStorage)
const DEMO_KEY = 'mp_demo_v1_' + (SITE.trade || 'site');
function seedDemo() {
  const S = window.SEED || {}; const cust = 'u_customer';
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  return {
    users: [{ id: 'u_owner', role: 'owner', name: 'Sample Owner', email: 'owner@demo.test', password: 'demo-owner' },
      { id: cust, role: 'customer', name: 'Sample Customer', email: 'customer@demo.test', password: 'demo-customer', phone: '(555) 010-0199' }],
    session: null,
    leads: [{ id: 'l1', name: 'Sample Lead', phone: '(555) 010-0142', email: 'lead@demo.test', service: SITE.services?.[0] || '', message: 'Sample request: please call me about a quote.', status: 'new', created: new Date().toISOString() }],
    bookings: [{ id: 'b1', date: d(2), time: '10:00', name: 'Sample Customer', phone: '(555) 010-0199', service: SITE.services?.[1] || '', status: 'pending', customerId: cust }],
    quotes: [{ id: 'q1', customerId: cust, title: 'Sample quote', status: 'sent', notes: 'Sample numbers for the demo only.', lines: [{ desc: 'Sample line item', qty: 1, unit: 50000 }, { desc: 'Sample materials', qty: 2, unit: 12500 }], created: new Date().toISOString() }],
    invoices: [{ id: 'i1', customerId: cust, title: 'Sample invoice', amount: 25000, status: 'unpaid', created: new Date().toISOString() }],
    jobs: [{ id: 'j1', customerId: cust, title: 'Sample project', status: 'In progress', progress: 40, notes: 'Sample status update.', photos: [] }],
    messages: [{ id: 'm1', customerId: cust, from: 'owner', body: 'Hi! This is a sample message from the owner.', at: new Date().toISOString() }],
    content: { site: {}, projects: S.projects || [], posts: S.posts || [] },
  };
}
class DemoStore {
  constructor() { this.db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null') || seedDemo(); this.save(); }
  save() { localStorage.setItem(DEMO_KEY, JSON.stringify(this.db)); }
  reset() { localStorage.removeItem(DEMO_KEY); this.db = seedDemo(); this.save(); }
  user() { return this.db.users.find((u) => u.id === this.db.session) || null; }
  need(role) { const u = this.user(); if (!u || (role && u.role !== role)) throw new Error('Not allowed'); return u; }
  pub(u) { return u && { id: u.id, role: u.role, name: u.name, email: u.email }; }
  mine(list) { const u = this.need(); return u.role === 'owner' ? list : list.filter((x) => x.customerId === u.id); }
  async login(email, password) { const u = this.db.users.find((x) => x.email === String(email).trim().toLowerCase() && x.password === password); if (!u) throw new Error('Wrong email or password'); this.db.session = u.id; this.save(); return this.pub(u); }
  async logout() { this.db.session = null; this.save(); }
  async me() { return this.pub(this.user()); }
  async createLead(d) { if (!d.name || !d.phone || !d.message) throw new Error('Name, phone and message are required'); const l = { id: uid(), ...d, status: 'new', created: new Date().toISOString() }; this.db.leads.unshift(l); this.save(); return l; }
  async listLeads() { this.need('owner'); return this.db.leads; }
  async updateLead(id, p) { this.need('owner'); Object.assign(this.db.leads.find((x) => x.id === id), p); this.save(); }
  taken(date) { return this.db.bookings.filter((b) => b.date === date && b.status !== 'cancelled').map((b) => b.time); }
  async availability(date) { return slotsFor(date, SITE.booking, this.taken(date)); }
  async createBooking(d) { if (!d.name || !d.phone) throw new Error('Name and phone are required'); if (!isValidSlot(d.date, d.time, SITE.booking, this.taken(d.date))) throw new Error('That time is not available'); const u = this.user(); const b = { id: uid(), ...d, status: 'pending', customerId: u?.role === 'customer' ? u.id : null }; this.db.bookings.push(b); this.save(); return b; }
  async listBookings() { return this.mine(this.db.bookings); }
  async updateBooking(id, p) { this.need('owner'); Object.assign(this.db.bookings.find((x) => x.id === id), p); this.save(); }
  async listCustomers() { this.need('owner'); return this.db.users.filter((u) => u.role === 'customer').map((u) => this.pub(u)); }
  async createCustomer(d) { this.need('owner'); const email = String(d.email || '').trim().toLowerCase(); if (!d.name || !email || !d.password) throw new Error('Name, email and password are required'); if (this.db.users.some((u) => u.email === email)) throw new Error('Email already used'); const u = { id: uid(), role: 'customer', name: d.name, email, password: d.password }; this.db.users.push(u); this.save(); return this.pub(u); }
  async listQuotes() { const u = this.need(); return this.mine(this.db.quotes).filter((q) => u.role === 'owner' || q.status !== 'draft'); }
  async createQuote(d) { this.need('owner'); const q = { id: uid(), status: 'draft', created: new Date().toISOString(), ...d }; this.db.quotes.unshift(q); this.save(); return q; }
  async updateQuote(id, p) { const u = this.need(); const q = this.db.quotes.find((x) => x.id === id); if (u.role !== 'owner') { if (q.customerId !== u.id || !['accepted', 'declined'].includes(p.status)) throw new Error('Not allowed'); p = { status: p.status }; } Object.assign(q, p); this.save(); }
  async listInvoices() { return this.mine(this.db.invoices); }
  async createInvoice(d) { this.need('owner'); const i = { id: uid(), status: 'unpaid', created: new Date().toISOString(), ...d }; this.db.invoices.unshift(i); this.save(); return i; }
  async updateInvoice(id, p) { this.need('owner'); Object.assign(this.db.invoices.find((x) => x.id === id), p); this.save(); }
  async listJobs() { return this.mine(this.db.jobs); }
  async createJob(d) { this.need('owner'); const j = { id: uid(), status: 'Scheduled', progress: 0, photos: [], ...d }; this.db.jobs.unshift(j); this.save(); return j; }
  async updateJob(id, p) { this.need('owner'); Object.assign(this.db.jobs.find((x) => x.id === id), p); this.save(); }
  async listPhotos(jobId) { const j = this.mine(this.db.jobs).find((x) => x.id === jobId); return j ? j.photos : []; }
  async uploadPhoto(jobId, file) {
    const j = this.mine(this.db.jobs).find((x) => x.id === jobId); if (!j) throw new Error('Not allowed');
    if (!/^image\//.test(file.type)) throw new Error('Images only');
    const url = await shrink(file); j.photos.push({ id: uid(), url, by: this.user().role, at: new Date().toISOString() }); this.save();
  }
  async listMessages(customerId) { const u = this.need(); const cid = u.role === 'owner' ? customerId : u.id; return this.db.messages.filter((m) => !cid || m.customerId === cid); }
  async sendMessage(d) { const u = this.need(); if (!String(d.body || '').trim()) throw new Error('Message is empty'); const m = { id: uid(), customerId: u.role === 'owner' ? d.customerId : u.id, from: u.role, body: d.body.trim(), at: new Date().toISOString() }; this.db.messages.push(m); this.save(); return m; }
  async getContent() { return this.db.content; }
  async saveContent(key, value) { this.need('owner'); this.db.content[key] = value; this.save(); }
}
function shrink(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onerror = rej; r.onload = () => { const im = new Image(); im.onload = () => { const s = Math.min(1, 640 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.7)); }; im.onerror = rej; im.src = r.result; }; r.readAsDataURL(file); }); }

const store = SITE.mode === 'demo' ? new DemoStore() : new ApiStore();
window.MP_STORE = store;

// ------------------------------------------------------------------ shared UI
// Menu sheet: labeled button, focus trap, Escape and Close return focus to the button.
const menuBtn = $('.menu-btn'); const sheet = $('#menu-sheet');
const focusables = (el) => $$('a[href],button:not([disabled]),input,select,textarea', el).filter((x) => x.offsetParent !== null);
function closeMenu() { sheet.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; menuBtn.focus(); }
if (menuBtn && sheet) {
  menuBtn.addEventListener('click', () => { sheet.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('.menu-close', sheet).focus(); });
  $('.menu-close', sheet).addEventListener('click', closeMenu);
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') return closeMenu(); if (e.key !== 'Tab') return; const f = focusables(sheet); const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); } });
  sheet.addEventListener('click', (e) => { if (e.target.closest('nav a')) sheet.hidden = true; });
}
// Gallery: category filter chips + lightbox (dialog, keyboard prev/next).
function initGallery() {
  const grid = $('[data-gallery]'); if (!grid) return; const dlg = $('#lightbox'); let idx = 0;
  const cards = () => $$('.card', grid).filter((c) => !c.hidden);
  const open = (i) => { const list = cards(); idx = (i + list.length) % list.length; const c = list[idx]; const after = $('.ba-after img, .ba-after .ph-tile', c) || $('img, .ph-tile', c);
    $('.lightbox-body', dlg).innerHTML = (after ? after.outerHTML : '') + `<h2 style="font-size:1.2rem">${esc($('h3', c)?.textContent || '')}</h2>`; if (!dlg.open) dlg.showModal(); };
  $$('.card', grid).forEach((c) => { if ($('.zoom', c)) return; c.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-ghost zoom">View larger<span class="sr-only">: ${esc($('h3', c)?.textContent || 'photo')}</span></button>`); });
  grid.addEventListener('click', (e) => { const z = e.target.closest('.zoom'); if (z) open(cards().indexOf(z.closest('.card'))); });
  $('[data-close]', dlg).onclick = () => dlg.close(); $('[data-prev]', dlg).onclick = () => open(idx - 1); $('[data-next]', dlg).onclick = () => open(idx + 1);
  dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') open(idx + 1); if (e.key === 'ArrowLeft') open(idx - 1); });
  document.addEventListener('click', (e) => { const chip = e.target.closest('.chip[data-cat]'); if (!chip) return; $$('.chip[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === chip)));
    $$('.card', grid).forEach((c) => { c.hidden = !!chip.dataset.cat && c.dataset.cat !== chip.dataset.cat; }); });
}
document.addEventListener('input', (e) => { if (e.target.matches('[data-ba]')) e.target.closest('.ba').style.setProperty('--split', e.target.value + '%'); });
const setStatus = (form, msg, err) => { const s = $('.status', form); s.textContent = msg; s.classList.toggle('err', !!err); };
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const pill = (s) => `<span class="pill ${/accept|paid|confirm|done|complete/i.test(s) ? 'ok' : /declin|cancel|lost/i.test(s) ? 'bad' : 'warn'}">${esc(s)}</span>`;
const sample = (x) => (x?.sample ? '<span class="sample-tag">Sample</span><br>' : '');

// Hydrate owner-edited content (headline/about/projects/posts) onto static pages.
async function hydrate() {
  if (!$('[data-content]') && !$('[data-list]')) return;
  let c; try { c = await store.getContent(); } catch { return; }
  for (const el of $$('[data-content]')) { const v = c.site?.[el.dataset.content]; if (v) el.innerHTML = el.dataset.content === 'about' ? md(v) : esc(v); }
  for (const el of $$('[data-list="projects"]')) { if (!c.projects?.length) continue; const list = c.projects.slice(0, Number(el.dataset.limit) || 99);
    el.innerHTML = list.map((p) => `<article class="card" data-cat="${esc(p.category || '')}"><div class="ba" style="--split:50%"><div class="ba-layer">${p.before ? `<img src="${esc(p.before)}" alt="Before: ${esc(p.title)}">` : '<div class="ph-tile" role="img" aria-label="Sample before photo"><span>Sample before photo</span></div>'}</div><div class="ba-layer ba-after">${p.after ? `<img src="${esc(p.after)}" alt="After: ${esc(p.title)}">` : '<div class="ph-tile after" role="img" aria-label="Sample after photo"><span>Sample after photo</span></div>'}</div><span class="ba-line" aria-hidden="true"></span><label class="sr-only" for="ba-${esc(p.id)}">Before and after comparison for ${esc(p.title)}</label><input id="ba-${esc(p.id)}" type="range" min="0" max="100" value="50" data-ba></div><h3 style="margin-top:1rem">${sample(p)}${esc(p.title)}</h3><p>${esc(p.city || '')}</p><p>${esc(p.summary || '')}</p></article>`).join(''); }
  for (const el of $$('[data-list="posts"]')) { if (!c.posts?.length) continue;
    el.innerHTML = [...c.posts].sort((a, b) => String(b.date).localeCompare(a.date)).map((p) => `<article class="card">${sample(p)}<h3><a href="${ROOT}blog/post/?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a></h3><p><time datetime="${esc(p.date)}">${esc(p.date)}</time></p><p>${esc(p.excerpt || '')}</p></article>`).join(''); }
}

const pages = {
  gallery() {},
  listings() { const q = (new URLSearchParams(location.search).get('q') || '').trim().toLowerCase(); if (!q) return;
    $$('main .grid > .card').forEach((c) => { c.hidden = !c.textContent.toLowerCase().includes(q); });
    $('main .grid').insertAdjacentHTML('beforebegin', `<p class="hint wrap" role="status">Showing listings matching “${esc(q)}”. <a href="./">Show all</a></p>`); },
  quote() {
    const form = $('#quote-form'); const sum = $('#quote-summary');
    const render = () => { const d = formData(form); sum.innerHTML = [['Service', d.service], ['Size', d.size || 'Not given'], ['Condition', d.condition], ['Timing', d.when]].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join(''); };
    form.addEventListener('input', render); form.addEventListener('change', render); render();
    form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form);
      $$('[required]', form).forEach((i) => i.setAttribute('aria-invalid', String(!i.value.trim())));
      if (!d.name.trim() || !d.phone.trim()) return setStatus(form, 'Name and phone are required.', true);
      const message = `Quote request. Size: ${d.size || 'n/a'}. Condition: ${d.condition}. Timing: ${d.when}.${d.notes ? ' Notes: ' + d.notes : ''}`;
      try { await store.createLead({ kind: 'quote', name: d.name, phone: d.phone, email: d.email, service: d.service, address: d.address, message }); form.reset(); render(); setStatus(form, SITE.mode === 'demo' ? 'Thanks! (Demo: saved to the owner dashboard in this browser.)' : 'Thanks! We will send your price soon.'); } catch (err) { setStatus(form, err.message, true); } });
  },
  order() {
    const cart = []; const ul = $('#cart'); const form = $('#order-form');
    const draw = () => { ul.innerHTML = cart.length ? cart.map((c, i) => `<li><span>${c.qty} × ${esc(c.name)}${c.opt ? ` (${esc(c.opt)})` : ''}</span><span><button type="button" data-dec="${i}" aria-label="Remove one ${esc(c.name)}">−</button> <button type="button" data-inc="${i}" aria-label="Add one ${esc(c.name)}">+</button></span></li>`).join('') : '<li class="hint">Nothing added yet.</li>'; };
    document.addEventListener('click', (e) => { const a = e.target.closest('[data-add]'); if (a) { const opt = $('#opt-' + a.dataset.add)?.value || ''; const ex = cart.find((c) => c.id === a.dataset.add && c.opt === opt); ex ? ex.qty++ : cart.push({ id: a.dataset.add, name: a.dataset.name, opt, qty: 1 }); draw(); }
      const inc = e.target.dataset?.inc, dec = e.target.dataset?.dec; if (inc !== undefined) { cart[inc].qty++; draw(); } if (dec !== undefined) { if (--cart[dec].qty <= 0) cart.splice(dec, 1); draw(); } });
    const t = new Date(); t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15 + 30, 0, 0); const times = ['As soon as possible'];
    for (let i = 0; i < 16; i++) { times.push(t.toTimeString().slice(0, 5)); t.setMinutes(t.getMinutes() + 15); }
    form.pickup.innerHTML = times.map((x) => `<option>${x}</option>`).join('');
    form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form);
      if (!cart.length) return setStatus(form, 'Add at least one item.', true); if (!d.name.trim() || !d.phone.trim()) return setStatus(form, 'Name and phone are required.', true);
      const message = `Pickup order for ${d.pickup}: ` + cart.map((c) => `${c.qty} x ${c.name}${c.opt ? ' (' + c.opt + ')' : ''}`).join(', ') + (d.notes ? `. Notes: ${d.notes}` : '');
      try { await store.createLead({ kind: 'order', name: d.name, phone: d.phone, service: 'Pickup order', message }); cart.length = 0; draw(); form.reset(); setStatus(form, SITE.mode === 'demo' ? 'Order request sent. (Demo: saved to the owner dashboard in this browser.)' : 'Order request sent. We will text or call to confirm.'); } catch (err) { setStatus(form, err.message, true); } });
  },
  async 'post-dynamic'() {
    const slug = new URLSearchParams(location.search).get('slug'); const c = await store.getContent(); const p = (c.posts || []).find((x) => x.slug === slug);
    $('#post-title').textContent = p ? p.title : 'Post not found'; $('#post-date').textContent = p?.date || ''; $('#post-body').innerHTML = p ? md(p.body) : ''; if (p) document.title = p.title + ' | ' + SITE.name;
  },
  contact() {
    const form = $('#lead-form'); const svc = new URLSearchParams(location.search).get('service'); if (svc) form.service.value = svc;
    form.addEventListener('submit', async (e) => { e.preventDefault(); const d = formData(form);
      const missing = ['name', 'phone', 'message'].filter((k) => !d[k].trim()); $$('[required]', form).forEach((i) => i.setAttribute('aria-invalid', String(!i.value.trim())));
      if (missing.length) return setStatus(form, 'Please fill in: ' + missing.join(', '), true);
      try { await store.createLead(d); form.reset(); setStatus(form, SITE.mode === 'demo' ? 'Thanks! (Demo: saved to the owner dashboard in this browser.)' : 'Thanks! We got your request and will be in touch.'); } catch (err) { setStatus(form, err.message, true); } });
  },
  book() {
    const form = $('#book-form'); const box = $('#bk-slots'); let chosen = '';
    const svc = new URLSearchParams(location.search).get('service'); if (svc) form.service.value = svc;
    const t = new Date(); t.setDate(t.getDate() + (SITE.booking?.leadDays ?? 1)); form.date.min = t.toISOString().slice(0, 10);
    const load = async () => { chosen = ''; const slots = await store.availability(form.date.value).catch(() => []);
      box.innerHTML = slots.length ? slots.map((s) => `<button type="button" data-time="${s.time}" aria-pressed="false" ${s.available ? '' : 'disabled aria-label="' + s.time + ' (booked)"'}>${s.time}</button>`).join('') : '<p class="hint">No open times that day. Try another day.</p>'; };
    form.date.addEventListener('change', load);
    box.addEventListener('click', (e) => { const b = e.target.closest('button[data-time]'); if (!b) return; $$('button', box).forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); chosen = b.dataset.time; });
    form.addEventListener('submit', async (e) => { e.preventDefault(); const d = { ...formData(form), time: chosen };
      if (!d.date || !chosen) return setStatus(form, 'Pick a day and an open time.', true);
      if (!d.name.trim() || !d.phone.trim()) return setStatus(form, 'Name and phone are required.', true);
      try { await store.createBooking(d); setStatus(form, `Requested ${d.date} at ${chosen}. The owner will confirm.`); form.reset(); box.innerHTML = ''; } catch (err) { setStatus(form, err.message, true); } });
  },
  async login() {
    const form = $('#login-form'); const u = await store.me(); if (u) location.href = ROOT + (u.role === 'owner' ? 'admin/' : 'portal/');
    form.addEventListener('submit', async (e) => { e.preventDefault(); try { const u = await store.login(form.email.value, form.password.value); location.href = ROOT + (u.role === 'owner' ? 'admin/' : 'portal/'); } catch (err) { setStatus(form, err.message, true); } });
  },
  portal: () => dashboard('customer'),
  admin: () => dashboard('owner'),
};

// ------------------------------------------------------------------ dashboards
async function dashboard(role) {
  const u = await store.me(); if (!u || u.role !== role) { location.href = ROOT + 'login/'; return; }
  $('#who').innerHTML = `Logged in as <strong>${esc(u.name)}</strong> · <button class="btn btn-ghost" id="logout" type="button" style="min-height:36px;padding:.3rem .8rem">Log out</button>${SITE.mode === 'demo' ? ' <button class="btn btn-ghost" id="reset" type="button" style="min-height:36px;padding:.3rem .8rem">Reset demo data</button>' : ''}`;
  $('#logout').onclick = async () => { await store.logout(); location.href = ROOT + 'login/'; };
  if ($('#reset')) $('#reset').onclick = () => { store.reset(); location.href = ROOT + 'login/'; };
  const tabs = role === 'owner'
    ? { overview: 'Overview', leads: 'Leads inbox', bookings: 'Bookings', quotes: 'Quote builder', invoices: 'Invoices', jobs: 'Projects & status', customers: 'Customers', messages: 'Messages', content: 'Site content', posts: 'Blog posts', gallery: 'Gallery' }
    : { overview: 'Overview', quotes: 'Quotes', invoices: 'Invoices', jobs: 'Project status', messages: 'Messages', bookings: 'Bookings' };
  const app = $('#app');
  app.innerHTML = `<div class="dash"><nav role="tablist" aria-label="Dashboard sections">${Object.entries(tabs).map(([k, l], i) => `<button role="tab" id="tab-${k}" data-tab="${k}" aria-selected="${i === 0}" aria-controls="panel">${l}</button>`).join('')}</nav><div id="panel" role="tabpanel" tabindex="0"></div></div>`;
  const panel = $('#panel');
  const show = async (k) => { $$('[role=tab]', app).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === k))); panel.setAttribute('aria-labelledby', 'tab-' + k);
    try { await (role === 'owner' ? OWNER : CUSTOMER)[k](panel, () => show(k)); } catch (e) { panel.innerHTML = `<p class="status err">${esc(e.message)}</p>`; } };
  $('nav', app).addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  $('nav', app).addEventListener('keydown', (e) => { if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; const bs = $$('[role=tab]', app); const i = bs.indexOf(document.activeElement); const n = bs[(i + (/Down|Right/.test(e.key) ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click(); e.preventDefault(); });
  show('overview');
}
const table = (cols, rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${cols.length}">Nothing yet.</td></tr>`}</tbody></table></div>`;
const payBtn = (inv) => inv.status === 'paid' ? pill('paid') : SITE.payLink
  ? `<a class="btn" href="${esc(SITE.payLink)}" target="_blank" rel="noopener">Pay invoice</a>`
  : `<button class="btn" type="button" disabled aria-disabled="true" title="Online payment is not set up yet">Pay invoice (not set up)</button>`;
const quoteView = (q, actions) => `<article class="card" style="margin-bottom:1rem"><h3>${esc(q.title)} ${pill(q.status)}</h3>${table(['Item', 'Qty', 'Unit', 'Line'], q.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td>${esc(l.qty)}</td><td>${money(l.unit)}</td><td>${money(l.qty * l.unit)}</td></tr>`))}<p><strong>Total: ${money(total(q.lines))}</strong></p>${q.notes ? `<p>${esc(q.notes)}</p>` : ''}${actions || ''}</article>`;
async function messagesUI(panel, refresh, customerId, me) {
  const msgs = await store.listMessages(customerId);
  panel.insertAdjacentHTML('beforeend', `<div class="msgs" aria-label="Messages">${msgs.map((m) => `<div class="msg ${m.from === me ? 'mine' : ''}"><small>${m.from === 'owner' ? 'Owner' : 'Customer'} · ${new Date(m.at).toLocaleString()}</small><br>${esc(m.body)}</div>`).join('') || '<p class="hint">No messages yet.</p>'}</div>
  <form class="form" id="msg-form"><label for="msg-body">New message</label><textarea id="msg-body" name="body" required></textarea><button class="btn" type="submit">Send</button><p class="status" role="status" aria-live="polite"></p></form>`);
  $('#msg-form').onsubmit = async (e) => { e.preventDefault(); try { await store.sendMessage({ body: e.target.body.value, customerId }); refresh(); } catch (err) { setStatus(e.target, err.message, true); } };
}
async function photosUI(el, job, refresh) {
  const ph = await store.listPhotos(job.id);
  el.innerHTML = `<div class="thumbs">${ph.map((p) => `<img src="${esc(p.url)}" alt="Project photo uploaded by ${esc(p.by)}">`).join('') || '<p class="hint">No photos yet.</p>'}</div><form class="form" data-up><label for="up-${job.id}">Upload a photo</label><input id="up-${job.id}" type="file" accept="image/*" name="photo"><button class="btn btn-secondary" type="submit">Upload</button><p class="status" role="status" aria-live="polite"></p></form>`;
  $('[data-up]', el).onsubmit = async (e) => { e.preventDefault(); const f = e.target.photo.files[0]; if (!f) return setStatus(e.target, 'Choose a photo first.', true); try { await store.uploadPhoto(job.id, f); refresh(); } catch (err) { setStatus(e.target, err.message, true); } };
}

const CUSTOMER = {
  async overview(p) { const [q, i, j] = await Promise.all([store.listQuotes(), store.listInvoices(), store.listJobs()]);
    p.innerHTML = `<div class="stats"><div class="stat"><b>${q.filter((x) => x.status === 'sent').length}</b>Quotes to review</div><div class="stat"><b>${i.filter((x) => x.status !== 'paid').length}</b>Unpaid invoices</div><div class="stat"><b>${j.length}</b>Projects</div></div>${j.map((x) => `<div class="card"><h3>${esc(x.title)} ${pill(x.status)}</h3><div class="progress" role="progressbar" aria-label="Progress" aria-valuenow="${x.progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${x.progress}%"></i></div><p>${esc(x.notes || '')}</p></div>`).join('')}`; },
  async quotes(p, r) { const q = await store.listQuotes(); p.innerHTML = q.map((x) => quoteView(x, x.status === 'sent' ? `<div class="btn-row"><button class="btn" data-acc="${x.id}">Accept quote</button><button class="btn btn-ghost" data-dec="${x.id}">Decline</button></div>` : '')).join('') || '<p>No quotes yet.</p>';
    p.onclick = async (e) => { const a = e.target.dataset.acc, d = e.target.dataset.dec; if (a || d) { await store.updateQuote(a || d, { status: a ? 'accepted' : 'declined' }); r(); } }; },
  async invoices(p) { const i = await store.listInvoices(); p.innerHTML = table(['Invoice', 'Amount', 'Status', ''], i.map((x) => `<tr><td>${esc(x.title)}</td><td>${money(x.amount)}</td><td>${pill(x.status)}</td><td>${payBtn(x)}</td></tr>`)) + (SITE.payLink ? '' : '<p class="hint">Online payment is turned off until the business adds a Stripe Payment Link.</p>'); },
  async jobs(p, r) { const j = await store.listJobs(); p.innerHTML = j.map((x) => `<article class="card" style="margin-bottom:1rem"><h3>${esc(x.title)} ${pill(x.status)}</h3><div class="progress" role="progressbar" aria-label="Progress" aria-valuenow="${x.progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${x.progress}%"></i></div><p>${esc(x.notes || '')}</p><div data-ph="${x.id}"></div></article>`).join('') || '<p>No projects yet.</p>';
    for (const x of j) await photosUI($(`[data-ph="${x.id}"]`, p), x, r); },
  async messages(p, r) { p.innerHTML = '<h2 style="margin-top:0">Messages with the owner</h2>'; await messagesUI(p, r, undefined, 'customer'); },
  async bookings(p) { const b = await store.listBookings(); p.innerHTML = table(['Day', 'Time', 'Service', 'Status'], b.map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.time)}</td><td>${esc(x.service || '')}</td><td>${pill(x.status)}</td></tr>`)) + `<p><a class="btn" href="${ROOT}book/">Book another visit</a></p>`; },
};

const OWNER = {
  async overview(p) { const [l, b, q, i] = await Promise.all([store.listLeads(), store.listBookings(), store.listQuotes(), store.listInvoices()]);
    p.innerHTML = `<div class="stats"><div class="stat"><b>${l.filter((x) => x.status === 'new').length}</b>New leads</div><div class="stat"><b>${b.filter((x) => x.status === 'pending').length}</b>Bookings to confirm</div><div class="stat"><b>${q.filter((x) => x.status === 'sent').length}</b>Quotes out</div><div class="stat"><b>${money(i.filter((x) => x.status !== 'paid').reduce((t, x) => t + x.amount, 0))}</b>Unpaid invoices</div></div><h2>Latest leads</h2>` + table(['Name', 'Service', 'Status'], l.slice(0, 5).map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.service || '')}</td><td>${pill(x.status)}</td></tr>`)); },
  async leads(p, r) { const l = await store.listLeads(); p.innerHTML = '<h2 style="margin-top:0">Leads inbox</h2>' + table(['Received', 'Contact', 'Request', 'Status'], l.map((x) => `<tr><td>${esc(new Date(x.created).toLocaleDateString())}</td><td>${esc(x.name)}<br><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>${x.email ? `<br>${esc(x.email)}` : ''}</td><td>${x.kind ? `<span class="pill">${esc(x.kind)}</span> ` : ''}<strong>${esc(x.service || '')}</strong><br>${esc(x.message)}</td><td><label class="sr-only" for="ls-${x.id}">Status for ${esc(x.name)}</label><select class="field" id="ls-${x.id}" data-lead="${x.id}">${['new', 'contacted', 'quoted', 'won', 'lost'].map((s) => `<option${s === x.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td></tr>`));
    p.onchange = async (e) => { if (e.target.dataset.lead) { await store.updateLead(e.target.dataset.lead, { status: e.target.value }); } }; },
  async bookings(p, r) { const b = await store.listBookings(); p.innerHTML = '<h2 style="margin-top:0">Bookings</h2>' + table(['Day', 'Time', 'Customer', 'Service', 'Status', ''], b.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)).map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.time)}</td><td>${esc(x.name)}<br>${esc(x.phone)}</td><td>${esc(x.service || '')}</td><td>${pill(x.status)}</td><td class="btn-row">${x.status === 'pending' ? `<button class="btn" data-bk="${x.id}" data-s="confirmed">Confirm</button>` : ''}${x.status !== 'cancelled' ? `<button class="btn btn-ghost" data-bk="${x.id}" data-s="cancelled">Cancel</button>` : ''}</td></tr>`));
    p.onclick = async (e) => { const id = e.target.dataset.bk; if (id) { await store.updateBooking(id, { status: e.target.dataset.s }); r(); } }; },
  async quotes(p, r) { const [q, c] = await Promise.all([store.listQuotes(), store.listCustomers()]);
    p.innerHTML = `<h2 style="margin-top:0">Quote builder</h2><form class="form card" id="qb"><label for="qb-c">Customer</label><select id="qb-c" name="customerId" required>${c.map((x) => `<option value="${x.id}">${esc(x.name)} (${esc(x.email)})</option>`).join('')}</select><label for="qb-t">Title</label><input id="qb-t" name="title" required>
    <fieldset style="border:0;padding:0;margin-top:1rem"><legend style="font-weight:600">Line items</legend><div id="qb-lines" class="quote-lines"></div><button type="button" class="btn btn-ghost" id="qb-add">Add line</button></fieldset>
    <p><strong>Total: <span id="qb-total">$0.00</span></strong></p><label for="qb-n">Notes</label><textarea id="qb-n" name="notes"></textarea><div class="btn-row"><button class="btn btn-secondary" type="submit" name="as" value="draft">Save draft</button><button class="btn" type="submit" name="as" value="sent">Send to customer</button></div><p class="status" role="status" aria-live="polite"></p></form><h2>All quotes</h2>${q.map((x) => quoteView(x, x.status === 'draft' ? `<button class="btn" data-send="${x.id}">Send</button>` : x.status === 'accepted' ? `<button class="btn btn-secondary" data-inv="${x.id}">Create invoice</button>` : '')).join('') || '<p>No quotes yet.</p>'}`;
    const lines = $('#qb-lines'); let n = 0;
    const add = () => { n++; lines.insertAdjacentHTML('beforeend', `<div class="line-row"><label class="sr-only" for="ld-${n}">Description</label><input class="field" id="ld-${n}" placeholder="Description" data-f="desc"><label class="sr-only" for="lq-${n}">Quantity</label><input class="field" id="lq-${n}" type="number" min="0" step="0.5" value="1" data-f="qty"><label class="sr-only" for="lu-${n}">Unit price in dollars</label><input class="field" id="lu-${n}" type="number" min="0" step="0.01" placeholder="Unit $" data-f="unit"><button type="button" class="btn btn-ghost" data-rm aria-label="Remove line">×</button></div>`); };
    const read = () => $$('.line-row', lines).map((row) => ({ desc: $('[data-f=desc]', row).value.trim(), qty: Number($('[data-f=qty]', row).value || 0), unit: Math.round(Number($('[data-f=unit]', row).value || 0) * 100) })).filter((l) => l.desc);
    add(); $('#qb-add').onclick = add; lines.oninput = () => { $('#qb-total').textContent = money(total(read())); }; lines.onclick = (e) => { if (e.target.dataset.rm !== undefined) { e.target.parentElement.remove(); lines.oninput(); } };
    $('#qb').onsubmit = async (e) => { e.preventDefault(); const f = e.target; const ls = read(); if (!f.title.value.trim() || !ls.length) return setStatus(f, 'Add a title and at least one line item.', true);
      await store.createQuote({ customerId: f.customerId.value, title: f.title.value.trim(), notes: f.notes.value, lines: ls, status: e.submitter?.value === 'sent' ? 'sent' : 'draft' }); r(); };
    p.onclick = async (e) => { if (e.target.dataset.send) { await store.updateQuote(e.target.dataset.send, { status: 'sent' }); r(); }
      if (e.target.dataset.inv) { const x = q.find((y) => y.id === e.target.dataset.inv); await store.createInvoice({ customerId: x.customerId, quoteId: x.id, title: 'Invoice for ' + x.title, amount: total(x.lines) }); await store.updateQuote(x.id, { status: 'invoiced' }); r(); } }; },
  async invoices(p, r) { const [i, c] = await Promise.all([store.listInvoices(), store.listCustomers()]); const name = (id) => c.find((x) => x.id === id)?.name || '';
    p.innerHTML = `<h2 style="margin-top:0">Invoices</h2>${table(['Customer', 'Invoice', 'Amount', 'Status', ''], i.map((x) => `<tr><td>${esc(name(x.customerId))}</td><td>${esc(x.title)}</td><td>${money(x.amount)}</td><td>${pill(x.status)}</td><td>${x.status !== 'paid' ? `<button class="btn btn-ghost" data-paid="${x.id}">Mark paid</button>` : ''}</td></tr>`))}<p class="hint">Pay-invoice button for customers: ${SITE.payLink ? 'ON (Stripe Payment Link configured).' : 'OFF. Set payments.stripePaymentLink in site.config.json to turn it on.'}</p>`;
    p.onclick = async (e) => { if (e.target.dataset.paid) { await store.updateInvoice(e.target.dataset.paid, { status: 'paid' }); r(); } }; },
  async jobs(p, r) { const [j, c] = await Promise.all([store.listJobs(), store.listCustomers()]);
    p.innerHTML = `<h2 style="margin-top:0">Projects &amp; status</h2><form class="form card" id="jf"><label for="jf-c">Customer</label><select id="jf-c" name="customerId">${c.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><label for="jf-t">Project title</label><input id="jf-t" name="title" required><button class="btn" type="submit">Add project</button><p class="status" role="status"></p></form>${j.map((x) => `<article class="card" style="margin:1rem 0"><h3>${esc(x.title)} ${pill(x.status)}</h3><form class="form" data-job="${x.id}"><label for="js-${x.id}">Status</label><select id="js-${x.id}" name="status">${['Scheduled', 'In progress', 'Waiting on materials', 'Final walkthrough', 'Complete'].map((s) => `<option${s === x.status ? ' selected' : ''}>${s}</option>`).join('')}</select><label for="jp-${x.id}">Progress (%)</label><input id="jp-${x.id}" name="progress" type="number" min="0" max="100" value="${x.progress}"><label for="jn-${x.id}">Update for customer</label><textarea id="jn-${x.id}" name="notes">${esc(x.notes || '')}</textarea><button class="btn btn-secondary" type="submit">Save</button></form><div data-ph="${x.id}"></div></article>`).join('')}`;
    $('#jf').onsubmit = async (e) => { e.preventDefault(); if (!e.target.title.value.trim()) return setStatus(e.target, 'Title required', true); await store.createJob({ customerId: e.target.customerId.value, title: e.target.title.value.trim() }); r(); };
    p.onsubmit = async (e) => { const id = e.target.dataset.job; if (!id) return; e.preventDefault(); const d = formData(e.target); await store.updateJob(id, { status: d.status, progress: Math.max(0, Math.min(100, Number(d.progress) || 0)), notes: d.notes }); r(); };
    for (const x of j) await photosUI($(`[data-ph="${x.id}"]`, p), x, r); },
  async customers(p, r) { const c = await store.listCustomers(); p.innerHTML = `<h2 style="margin-top:0">Customers</h2>${table(['Name', 'Email'], c.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td></tr>`))}<form class="form card" id="cf" style="margin-top:1rem"><h3>Add a customer login</h3><label for="cf-n">Name</label><input id="cf-n" name="name" required><label for="cf-e">Email</label><input id="cf-e" name="email" type="email" required><label for="cf-p">Temporary password</label><input id="cf-p" name="password" required minlength="8"><button class="btn" type="submit">Create login</button><p class="status" role="status"></p></form>`;
    $('#cf').onsubmit = async (e) => { e.preventDefault(); try { await store.createCustomer(formData(e.target)); r(); } catch (err) { setStatus(e.target, err.message, true); } }; },
  async messages(p, r) { const c = await store.listCustomers(); const cur = p.dataset.cust && c.some((x) => x.id === p.dataset.cust) ? p.dataset.cust : c[0]?.id;
    p.innerHTML = `<h2 style="margin-top:0">Messages</h2><label for="mc" style="font-weight:600">Customer</label> <select class="field" id="mc" style="max-width:320px">${c.map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
    $('#mc').onchange = (e) => { p.dataset.cust = e.target.value; r(); }; if (cur) await messagesUI(p, r, cur, 'owner'); },
  async content(p, r) { const c = await store.getContent(); const s = c.site || {};
    p.innerHTML = `<h2 style="margin-top:0">Edit site content</h2><form class="form card" id="sc"><label for="sc-h">Home headline</label><input id="sc-h" name="headline" value="${esc(s.headline || '')}"><label for="sc-i">Home intro</label><textarea id="sc-i" name="intro">${esc(s.intro || '')}</textarea><label for="sc-a">About page (markdown)</label><textarea id="sc-a" name="about" style="min-height:180px">${esc(s.about || '')}</textarea><p class="hint">Leave a field blank to keep the text from site.config.json.</p><button class="btn" type="submit">Save</button><p class="status" role="status" aria-live="polite"></p></form>`;
    $('#sc').onsubmit = async (e) => { e.preventDefault(); await store.saveContent('site', formData(e.target)); setStatus(e.target, 'Saved. Public pages now show the new text.'); }; },
  async posts(p, r) { const c = await store.getContent(); const posts = c.posts || [];
    p.innerHTML = `<h2 style="margin-top:0">Blog posts</h2>${table(['Date', 'Title', ''], posts.map((x, i) => `<tr><td>${esc(x.date)}</td><td>${sample(x)}<a href="${ROOT}blog/post/?slug=${encodeURIComponent(x.slug)}">${esc(x.title)}</a></td><td><button class="btn btn-ghost" data-del="${i}">Delete</button></td></tr>`))}<form class="form card" id="pf" style="margin-top:1rem"><h3>New post</h3><label for="pf-t">Title</label><input id="pf-t" name="title" required><label for="pf-d">Date</label><input id="pf-d" name="date" type="date" value="${today()}"><label for="pf-e">Excerpt</label><input id="pf-e" name="excerpt"><label for="pf-b">Body (markdown)</label><textarea id="pf-b" name="body" required></textarea><button class="btn" type="submit">Publish post</button><p class="status" role="status"></p></form>`;
    $('#pf').onsubmit = async (e) => { e.preventDefault(); const d = formData(e.target); if (!d.title.trim() || !d.body.trim()) return setStatus(e.target, 'Title and body are required.', true); d.slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid().slice(0, 4); await store.saveContent('posts', [d, ...posts]); r(); };
    p.onclick = async (e) => { if (e.target.dataset.del !== undefined) { posts.splice(Number(e.target.dataset.del), 1); await store.saveContent('posts', posts); r(); } }; },
  async gallery(p, r) { const c = await store.getContent(); const list = c.projects || [];
    p.innerHTML = `<h2 style="margin-top:0">Gallery projects</h2>${table(['Title', 'City', ''], list.map((x, i) => `<tr><td>${sample(x)}${esc(x.title)}</td><td>${esc(x.city || '')}</td><td><button class="btn btn-ghost" data-del="${i}">Delete</button></td></tr>`))}<form class="form card" id="gf" style="margin-top:1rem"><h3>Add a project</h3><label for="gf-t">Title</label><input id="gf-t" name="title" required><label for="gf-c">City</label><input id="gf-c" name="city"><label for="gf-s">Summary</label><textarea id="gf-s" name="summary"></textarea><label for="gf-b">Before photo</label><input id="gf-b" name="before" type="file" accept="image/*"><label for="gf-a">After photo</label><input id="gf-a" name="after" type="file" accept="image/*"><button class="btn" type="submit">Add project</button><p class="status" role="status"></p></form>`;
    $('#gf').onsubmit = async (e) => { e.preventDefault(); const f = e.target; if (!f.title.value.trim()) return setStatus(f, 'Title required', true);
      const pic = async (inp) => (inp.files[0] ? (SITE.mode === 'demo' ? shrink(inp.files[0]) : (await uploadPublic(inp.files[0])).url) : '');
      try { const item = { id: uid(), title: f.title.value.trim(), city: f.city.value, summary: f.summary.value, before: await pic(f.before), after: await pic(f.after) }; await store.saveContent('projects', [item, ...list]); r(); } catch (err) { setStatus(f, err.message, true); } };
    p.onclick = async (e) => { if (e.target.dataset.del !== undefined) { list.splice(Number(e.target.dataset.del), 1); await store.saveContent('projects', list); r(); } }; },
};
async function uploadPublic(file) { const f = new FormData(); f.append('photo', file); return store.req('POST', '/content/upload', f, true); }

hydrate().then(initGallery); pages[document.body.dataset.page]?.();
