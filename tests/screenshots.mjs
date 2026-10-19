// Saves /workspace/mockups/mp-*.png from the demo build (or MOCKUP_DIR).
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
import { serve } from './serve.mjs';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT = process.env.MOCKUP_DIR || '/workspace/mockups'; fs.mkdirSync(OUT, { recursive: true });
const srv = await serve(path.join(ROOT, 'dist-demo')); const b = await chromium.launch();
const shot = async (vp, p, file, login, full = true) => { const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1 }); const pg = await ctx.newPage();
  if (login) { await pg.goto(srv.url + 'login/'); await pg.fill('#li-email', login[0]); await pg.fill('#li-pass', login[1]); await pg.click('#login-form button'); await pg.waitForURL(/(admin|portal)\//); await pg.waitForSelector('.stats'); }
  else await pg.goto(srv.url + p, { waitUntil: 'load' });
  await pg.addStyleTag({ content: 'iframe.map-frame{visibility:hidden}' });
  await pg.screenshot({ path: path.join(OUT, file), fullPage: full }); console.log(path.join(OUT, file)); await ctx.close(); };
await shot({ width: 1440, height: 900 }, '', 'mp-home-desktop.png');
await shot({ width: 390, height: 844 }, '', 'mp-home-mobile.png');
await shot({ width: 1440, height: 900 }, null, 'mp-admin-dashboard.png', ['owner@demo.test', 'demo-owner'], false);
await shot({ width: 1440, height: 900 }, null, 'mp-customer-portal.png', ['customer@demo.test', 'demo-customer'], false);
await b.close(); srv.close();
