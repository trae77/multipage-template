// D3 + D4 (William via CEO relay, 2026-10-30): render in headless Chromium.
// D3: main menu shows BOTH "Owner demo" and "Client demo" links at 1280, 768, 390 (390 opens the mobile menu).
// D4: no href on any crawled same-origin page points at the real /owner/ path (demo paths like /demo/owner are fine).
// Usage: node demo-nav-render.mjs <url> [maxPages]. Prints "D3 ..."/"D4 ..." lines.
// Exit bits: 1 = D3 fail, 2 = D4 fail (3 = both); 4 = browser unavailable/render error (caller must FAIL).
import { createRequire } from 'node:module';
const url = process.argv[2], MAX = +(process.argv[3] || 40);
let chromium;
for (const base of [import.meta.url, process.cwd() + '/', '/tmp/bf-pw/']) { try { ({ chromium } = createRequire(base)('playwright')); break; } catch {} }
if (!chromium) { console.error('playwright unavailable'); process.exit(4); }
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' }); }
catch { try { browser = await chromium.launch(); } catch { console.error('chromium unavailable'); process.exit(4); } }
const OWNER_RE = /^\/owner(\/|$|\?|#)/i;
const settle = async (p) => { await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500); };
const visDemo = (p) => p.evaluate(() => {
  const vis = (a) => { const r = a.getBoundingClientRect(), s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0; };
  const links = [...document.querySelectorAll('header a, nav a, [role="navigation"] a, [role="dialog"] a, [class*="menu" i] a, [id*="menu" i] a, [class*="drawer" i] a')].filter(vis);
  const t = (a) => (a.textContent || '').replace(/\s+/g, ' ').trim();
  return { owner: links.filter((a) => /owner\s*demo/i.test(t(a))).map((a) => `${t(a)} -> ${a.getAttribute('href')}`),
           client: links.filter((a) => /client\s*demo/i.test(t(a))).map((a) => `${t(a)} -> ${a.getAttribute('href')}`) };
});
let bits = 0;
try {
  // D3
  for (const w of [1280, 768, 390]) {
    const p = await browser.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(url, { waitUntil: 'load', timeout: 30000 }); await settle(p);
    let r = await visDemo(p), opened = '';
    if (!(r.owner.length && r.client.length)) {
      const sel = 'header button, nav button, [aria-controls], [aria-expanded], button[aria-label*="menu" i], [class*="hamburger" i], [class*="menu-toggle" i], [class*="nav-toggle" i], summary';
      for (const h of await p.$$(sel)) {
        if (!(await h.isVisible().catch(() => false))) continue;
        await h.click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(500);
        r = await visDemo(p); if (r.owner.length && r.client.length) { opened = ' (after opening menu)'; break; }
      }
    }
    if (r.owner.length && r.client.length) console.log(`PASS D3 ${w}px demo links in menu${opened}: ${r.owner[0]} | ${r.client[0]}`);
    else { bits |= 1; console.log(`FAIL D3 ${w}px menu missing${r.owner.length ? '' : ' "Owner demo"'}${r.client.length ? '' : ' "Client demo"'}`); }
    await p.close();
  }
  // D4: same-origin crawl from start URL (rendered DOM)
  const start = new URL(url), seen = new Set(), queue = [start.href], hits = [];
  const scope = start.pathname.replace(/[^/]*$/, '');
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  while (queue.length && seen.size < MAX) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    const res = await p.goto(u, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
    if (!res || !(res.headers()['content-type'] || '').includes('html')) continue;
    await settle(p);
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('[href]')].map((a) => [a.getAttribute('href'), a.href || a.getAttribute('href'), (a.textContent || '').trim().slice(0, 40)]));
    for (const [raw, abs, txt] of hrefs) {
      let x; try { x = new URL(abs, u); } catch { continue; }
      if (x.origin === start.origin && OWNER_RE.test(x.pathname)) hits.push(`${u} : "${txt}" -> ${raw}`);
      if (x.origin === start.origin && x.pathname.startsWith(scope) && !OWNER_RE.test(x.pathname) && !/\.(png|jpe?g|webp|svg|gif|pdf|css|js|ico|xml|txt|json|woff2?)$/i.test(x.pathname)) {
        x.hash = ''; if (!seen.has(x.href)) queue.push(x.href);
      }
    }
  }
  await p.close();
  if (hits.length) { bits |= 2; console.log(`FAIL D4 real /owner/ linked (${hits.length}) across ${seen.size} pages:\n  ` + [...new Set(hits)].slice(0, 15).join('\n  ')); }
  else console.log(`PASS D4 no href to real /owner/ across ${seen.size} rendered pages`);
} catch (e) { console.error('render failed: ' + e.message); bits |= 4; } finally { await browser.close(); }
process.exit(bits);
