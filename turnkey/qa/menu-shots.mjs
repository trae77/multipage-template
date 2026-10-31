// Menu overflow + screenshots. Usage: node menu-shots.mjs <url> <outdir>
// For each width: full header screenshot; if a menu toggle is visible, open it and screenshot the open menu.
// FAIL (exit 1) if page scrollWidth > viewport, or any visible header/nav link is clipped outside the viewport. Exit 2 = browser unavailable.
import { createRequire } from 'node:module'; import fs from 'node:fs';
const [url, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let chromium; for (const b of [import.meta.url, process.cwd() + '/']) { try { ({ chromium } = createRequire(b)('playwright')); break; } catch {} }
if (!chromium) { console.error('playwright unavailable'); process.exit(2); }
const b = await chromium.launch(); let fail = 0;
for (const w of [360, 390, 412, 768, 1024, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 } });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(700);
  const check = async (tag) => {
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
      const links = [...document.querySelectorAll('header a, nav a')].filter((a) => { const r = a.getBoundingClientRect(), s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; });
      const clipped = links.filter((a) => { const r = a.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; }).map((a) => a.textContent.trim());
      const demos = links.filter((a) => /\/demo(\/|$)/i.test(new URL(a.href, location.href).pathname)).map((a) => a.textContent.trim());
      return { vw, sw, clipped, demos };
    });
    const bad = r.sw > r.vw + 1 || r.clipped.length; if (bad) fail = 1;
    console.log(`${bad ? 'FAIL' : 'PASS'} ${w}px ${tag}: scrollWidth=${r.sw} vw=${r.vw} clipped=[${r.clipped}] visibleDemoLinks=[${r.demos}]`);
    await p.screenshot({ path: `${out}/${w}-${tag}.png` });
  };
  await check('closed');
  const t = p.locator(['button[aria-controls]', '.nav-toggle', '.menu-toggle', '.menubtn', 'button[aria-label*="menu" i]', 'button[aria-label*="navigation" i]'].map((x) => 'header ' + x).join(', ')).filter({ visible: true }).first();
  if (await t.count()) { await t.click({ timeout: 5000 }); await p.waitForTimeout(500); await check('menu-open'); }
  await p.close();
}
await b.close(); process.exit(fail);
