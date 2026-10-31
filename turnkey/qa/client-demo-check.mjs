// Usage: node client-demo-check.mjs <demoUrl> <outdir> [--allow <allow.json>] <siteUrl...>
// Client demo: SAMPLE banner, noindex, no off-origin requests at ANY point (load, tab switches, add, edit, remove, reset, reload),
// no real-looking phone/email in rendered text or HTML, no login surface (password/login form/auth endpoint/session cookie),
// every tab renders + saves + has 0 overflow at 6 widths, 0 enforced CSP violations (demo + site pages).
// Hardened 2026-10-30 (QA P2-1 a-f). Exit 0 PASS, 1 FAIL, 2 browser unavailable.
// allow.json (optional): {"phones":["(720) 477-8603"],"emails":["x@y.com"]}. Known real numbers (U-TIME 720, Vince 719-717-5809)
// PASS only when listed there; 555-01xx numbers and example.com/.test/.invalid emails always pass.
import { createRequire } from 'node:module'; import fs from 'node:fs';
let chromium; for (const b of [import.meta.url, process.cwd() + '/', '/tmp/bf-pw/']) { try { ({ chromium } = createRequire(b)('playwright')); break; } catch {} }
const args = process.argv.slice(2); let allowFile = ''; const ai = args.indexOf('--allow'); if (ai >= 0) { allowFile = args[ai + 1]; args.splice(ai, 2); }
const [demo, out, ...sites] = args; fs.mkdirSync(out, { recursive: true });
const allow = allowFile ? JSON.parse(fs.readFileSync(allowFile, 'utf8')) : {};
const digits = (s) => String(s).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const allowPhones = new Set((allow.phones || []).map(digits)), allowEmails = new Set((allow.emails || []).map((e) => e.toLowerCase()));
export const PHONE_RE = /(?<![\d-])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?![\d-])/g;
export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const fakePhone = (d) => /^\d{3}555\d{4}$/.test(d);
const fakeEmail = (e) => /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|[a-z0-9-]+\.(?:test|invalid|example))$/i.test(e);
let b; const exe = process.env.CHROME || '/usr/bin/google-chrome';
try { b = await chromium.launch({ executablePath: exe }); } catch (e) { console.error(`chrome unavailable at ${exe}: ${e.message}`); process.exit(2); }
let fail = 0; const R = (c, m) => { if (!c) fail = 1; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const origin = new URL(demo).origin, ext = [], csp = [], authReq = [];
const AUTH_RE = /\/(api\/)?(auth|login|logout|signin|signup|session|token|oauth|forgot|reset|invite)(\/|\?|$)/i;
const ctx = await b.newContext();
const watch = (p, tag) => {
  p.on('request', (q) => { const u = q.url(); if (!u.startsWith(origin) && !/^(data|blob|about):/.test(u)) ext.push(`${tag}${tag === 'demo' ? ' ' + phase : ''}: ${u}`); if (u.startsWith(origin) && AUTH_RE.test(new URL(u).pathname)) authReq.push(`${tag}: ${u}`); });
  // (f) only ENFORCED violations; Report-Only warnings are ignored.
  p.on('console', (m) => { const t = m.text(); if (/report-only/i.test(t)) return; if (/Refused to|violates/i.test(t)) csp.push(t.slice(0, 160)); });
};
let phase = 'load'; const p = await ctx.newPage(); watch(p, 'demo'); const ph = (x) => { phase = x; };
await p.goto(demo); await p.waitForTimeout(600);
R(/SAMPLE/.test(await p.locator('.demo-banner').innerText().catch(() => '')), 'SAMPLE banner');
R(/noindex/.test((await p.locator('meta[name=robots]').getAttribute('content').catch(() => '')) || ''), 'noindex meta');
// (c) no login surface of any kind
const loginUi = await p.evaluate(() => {
  const hits = [];
  if (document.querySelector('input[type=password], input[autocomplete="current-password"], input[autocomplete="new-password"]')) hits.push('password field');
  for (const f of document.querySelectorAll('form')) { const a = (f.getAttribute('action') || '') + ' ' + (f.id || '') + ' ' + (f.className || '') + ' ' + (f.getAttribute('name') || '');
    if (/log ?in|sign ?in|auth|session|password/i.test(a) || /\b(log ?in|sign ?in)\b/i.test(f.innerText || '')) hits.push('login form: ' + a.trim().slice(0, 60)); }
  for (const a of document.querySelectorAll('[href], [action], [formaction], [data-endpoint], [data-api]')) {
    const v = a.getAttribute('href') || a.getAttribute('action') || a.getAttribute('formaction') || a.getAttribute('data-endpoint') || a.getAttribute('data-api') || '';
    if (/\/(api\/)?(auth|login|signin|session|oauth|token)(\/|\?|$)/i.test(v)) hits.push('auth endpoint: ' + v); }
  const src = [...document.scripts].map((s) => s.textContent).join('\n');
  const m = src.match(/['"`]\/(?:api\/)?(?:auth|login|signin|session|oauth|token)(?:\/[^'"`]*)?['"`]/i); if (m) hits.push('auth endpoint in inline script: ' + m[0]);
  return hits;
});
R(!loginUi.length, `no login surface (password/login form/auth endpoint)${loginUi.length ? ': ' + loginUi.join('; ') : ''}`);
// (b) real-looking phones/emails in rendered text AND html (all tabs visited below too)
const piiHits = new Set();
const scanPII = async (where) => {
  const { text, html } = await p.evaluate(() => ({ text: document.body.innerText, html: document.documentElement.outerHTML }));
  for (const src of [text, html]) {
    for (const m of src.matchAll(PHONE_RE)) { const d = m[1] + m[2] + m[3]; if (!fakePhone(d) && !allowPhones.has(d)) piiHits.add(`${where}: phone ${m[0].trim()}`); }
    for (const m of src.matchAll(EMAIL_RE)) { const e = m[0].toLowerCase(); if (!fakeEmail(e) && !allowEmails.has(e) && !/\.(png|jpe?g|webp|svg|gif|css|js)$/i.test(e)) piiHits.add(`${where}: email ${e}`); }
  }
};
await scanPII('load');
const tabs = await p.locator('#cd-tabs button').count(); R(tabs >= 3, `tabs: ${tabs}`);
const W = [360, 390, 412, 768, 1024, 1280];
// (d) every tab: renders, add saves + persists, edit (if present), remove, overflow at 6 widths; (a) requests watched throughout
for (let i = 0; i < tabs; i++) {
  ph(`tab${i + 1}`); await p.locator('#cd-tabs button').nth(i).click(); await p.waitForTimeout(200);
  const n0 = await p.locator('.cd-item').count(); R(n0 > 0, `tab ${i + 1} renders items (${n0})`);
  await scanPII(`tab${i + 1}`);
  const first = p.locator('.cd-add input, .cd-add select').first();
  if (await first.count()) {
    ph(`tab${i + 1}-add`);
    const t = await first.getAttribute('type'); if (t === 'date') await first.fill('2026-11-20'); else if ((await first.evaluate((e) => e.tagName)) === 'SELECT') await first.selectOption({ index: 1 }).catch(() => {}); else await first.fill('Sample test entry');
    await p.locator('.cd-add .cd-b').first().click(); await p.waitForTimeout(200);
    R(await p.locator('.cd-item').count() === n0 + 1, `tab ${i + 1} add item`);
    ph(`tab${i + 1}-reload`); await p.reload(); await p.waitForTimeout(300); await p.locator('#cd-tabs button').nth(i).click(); await p.waitForTimeout(150);
    R(await p.locator('.cd-item').count() === n0 + 1, `tab ${i + 1} save persists (localStorage)`);
    const edit = p.locator('.cd-item [contenteditable="true"], .cd-item input, .cd-item .cd-edit').first();
    if (await edit.count()) { ph(`tab${i + 1}-edit`); await edit.click().catch(() => {}); if (await edit.evaluate((e) => e.isContentEditable || e.tagName === 'INPUT')) { await edit.fill?.('Edited sample').catch(() => {}); await p.keyboard.press('Tab'); } await p.waitForTimeout(200); }
    const rm = p.locator('.cd-item button').filter({ hasText: /cancel|remove|delete/i }).first();
    if (await rm.count()) { ph(`tab${i + 1}-remove`); await rm.click(); await p.waitForTimeout(150); R(await p.locator('.cd-item').count() === n0, `tab ${i + 1} remove item`); }
    else { ph(`tab${i + 1}-reset`); await p.locator('#cd-reset').click(); await p.waitForTimeout(200); await p.locator('#cd-tabs button').nth(i).click(); R(await p.locator('.cd-item').count() === n0, `tab ${i + 1} reset clears added item (no remove button)`); }
  } else R(true, `tab ${i + 1} has no add form (read-only tab)`);
  for (const w of W) { await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(120);
    const r = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); R(r[0] <= r[1], `tab ${i + 1} overflow ${w}px (${r[0]}/${r[1]})`);
    await p.screenshot({ path: `${out}/client-demo-tab${i + 1}-${w}.png`, fullPage: true }); }
  await p.setViewportSize({ width: 1280, height: 800 });
}
ph('reset'); await p.locator('#cd-tabs button').first().click(); const nR = await p.locator('.cd-item').count();
if (await p.locator('.cd-add .cd-b').count()) await p.locator('.cd-add .cd-b').first().click();
await p.locator('#cd-reset').click(); await p.waitForTimeout(300); R(await p.locator('.cd-item').count() === nR, 'reset restores sample data');
ph('reload-after-reset'); await p.reload(); await p.waitForTimeout(400); await scanPII('after-reset');
// (c) session cookies / storage tokens
const cookies = (await ctx.cookies()).filter((c) => /sess|auth|token|jwt|sid|login|CF_Authorization/i.test(c.name));
R(!cookies.length, `no session/auth cookies${cookies.length ? ': ' + cookies.map((c) => c.name).join(', ') : ''}`);
R(!authReq.length, `no auth endpoint requests${authReq.length ? ':\n  ' + authReq.slice(0, 6).join('\n  ') : ''}`);
const demoExt = ext.filter((x) => /demo/.test(x)); R(!demoExt.length, `demo off-site requests during load/tabs/add/edit/remove/reset/reload: ${demoExt.length}${demoExt.length ? '\n  ' + demoExt.slice(0, 8).join('\n  ') : ''}`);
R(!piiHits.size, `no real-looking phone/email (555 + example/.test allowed${allowFile ? ', allowlist ' + allowFile : ''}): ${piiHits.size}${piiHits.size ? '\n  ' + [...piiHits].slice(0, 10).join('\n  ') : ''}`);
for (const s of sites) { const q = await ctx.newPage(); watch(q, 'site'); await q.goto(s); await q.waitForTimeout(800); await q.close(); }
R(!csp.length, `enforced CSP violations (demo + ${sites.length} site pages; Report-Only ignored): ${csp.length}${csp.length ? '\n  ' + csp.slice(0, 6).join('\n  ') : ''}`);
await b.close(); process.exit(fail);
