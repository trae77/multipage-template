// D2: render the page in headless Chromium and assert no visible Owner/Login/Admin/Demo link in header/nav/footer.
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
try {
  const found = [];
  for (const w of [390, 1280]) {
    const p = await browser.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(url, { waitUntil: 'load', timeout: 30000 });
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); // third-party widgets may never idle
    await p.waitForTimeout(500);
    found.push(...await p.evaluate(() => [...document.querySelectorAll('header a, nav a, footer a, [role="navigation"] a, header button, nav button')]
      .filter((a) => { const r = a.getBoundingClientRect(), s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; })
      .filter((a) => /\b(owner|log ?in|sign ?in|admin|dashboard)\b/i.test(a.textContent || '') || /\/(owner|admin|login|signin|dashboard|demo\/owner)\b/i.test(a.getAttribute('href') || ''))
      .map((a) => `${(a.textContent || '').trim()} -> ${a.getAttribute('href') || '(button)'}`)).then((x) => x.map((y) => `${w}px: ${y}`)));
    await p.close();
  }
  if (found.length) { console.log(found.join('\n')); process.exit(1); }
  process.exit(0);
} catch (e) { console.error('render failed: ' + e.message); process.exit(2); } finally { await browser.close(); }
