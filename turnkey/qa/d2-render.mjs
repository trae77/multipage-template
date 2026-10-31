// D2: render the site in headless Chromium and assert no visible real Owner/Login/Admin link (menus: by text or href; page body: by href).
// Links whose href path is a demo route (/demo/..., /<slug>/demo/...) are ALLOWED (William, CEO relay Oct 30: demo links in preview menus).
// Real /owner, /admin, /login, /signin, /dashboard links (and owner/login text not pointing at a demo path) still FAIL.
// Exit 0 = PASS, 1 = FAIL (link found), 2 = browser unavailable (caller must FAIL, never pass).
const url = process.argv[2];
let chromium;
import { createRequire } from 'node:module';
for (const base of [import.meta.url, process.cwd() + '/', process.cwd() + '/turnkey/']) {
  try { ({ chromium } = createRequire(base)('playwright')); break; } catch {}
}
if (!chromium) { console.error('playwright unavailable'); process.exit(2); }
let browser;
try { browser = await chromium.launch(); } catch { console.error('chromium unavailable'); process.exit(2); }
// P3-5 (QA punch 2026-10-30): check the home page AND up to D2_MAX_PAGES same-origin pages linked from it (default 20),
// every <a>/<button> on the page (not only header/nav/footer). Demo routes stay allowed.
const MAX = +(process.env.D2_MAX_PAGES || 20);
const SKIP = /\.(png|jpe?g|webp|svg|gif|ico|pdf|css|js|mjs|xml|txt|json|woff2?)$/i;
try {
  const found = [];
  const start = new URL(url), scope = start.pathname.replace(/[^/]*$/, ''), seen = new Set(), queue = [start.href];
  while (queue.length && seen.size < MAX) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    for (const w of [390, 1280]) {
      const p = await browser.newPage({ viewport: { width: w, height: 900 } });
      const res = await p.goto(u, { waitUntil: 'load', timeout: 30000 });
      if (u !== start.href && !(res && (res.headers()['content-type'] || '').includes('html'))) { await p.close(); break; }
      await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); // third-party widgets may never idle
      await p.waitForTimeout(300);
      found.push(...await p.evaluate(() => [...document.querySelectorAll('a, button, [role="link"]')]
        .filter((a) => { const r = a.getBoundingClientRect(), s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; })
        .filter((a) => { const h = a.getAttribute('href') || ''; let path = h; try { path = new URL(h, location.href).pathname; } catch {}
          if (/^(mailto|tel):/i.test(h)) return false;
          const m = path.match(/^(.*?)\/demo(\/|$)/i); // demo route allowed unless a real owner/admin/login segment comes BEFORE /demo (e.g. /owner/demo)
          if (a.tagName === 'A' && m && !/\/(owner|admin|login|signin|dashboard)(\/|$)/i.test(m[1] + '/')) return false;
          const inMenu = !!a.closest('header, nav, footer, [role="navigation"]');
          return (inMenu && /\b(owner|log ?in|sign ?in|admin|dashboard)\b/i.test(a.textContent || '')) || /\/(owner|admin|login|signin|dashboard)\b/i.test(path); })
        .map((a) => `${(a.textContent || '').trim()} -> ${a.getAttribute('href') || '(button)'}`)).then((x) => x.map((y) => `${w}px ${u}: ${y}`)));
      if (w === 1280) for (const h of await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href))) {
        let x; try { x = new URL(h); } catch { continue; }
        if (x.origin !== start.origin || !x.pathname.startsWith(scope) || SKIP.test(x.pathname) || /\/(owner|admin|login|signin|dashboard)(\/|$)/i.test(x.pathname) || /\/demo(\/|$)/i.test(x.pathname)) continue;
        x.hash = ''; x.search = ''; if (!seen.has(x.href)) queue.push(x.href);
      }
      await p.close();
    }
  }
  console.error(`D2 checked ${seen.size} page(s)`);
  if (found.length) { console.log(found.join('\n')); process.exit(1); }
  process.exit(0);
} catch (e) { console.error('render failed: ' + e.message); process.exit(2); } finally { await browser.close(); }
