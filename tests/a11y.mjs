// axe-core over every built demo page (dist-demo). Fails on serious or critical WCAG 2.0/2.1 A/AA violations.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = path.join(ROOT, process.argv[2] || 'dist-demo');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const pages = fs.readdirSync(base, { recursive: true }).filter((f) => f.endsWith('index.html') && !/(^|\/)(admin|portal)\//.test(f)).map((f) => f.replace(/index\.html$/, ''));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml' };
const server = http.createServer((q, r) => {
  let f = path.join(base, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(base) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = server.address().port; const browser = await chromium.launch(); let bad = 0;
for (const pg of pages) for (const width of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } }); const p = await ctx.newPage();
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p.goto(`http://127.0.0.1:${port}/${pg}`, { waitUntil: 'load' }); await p.waitForTimeout(150);
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })).violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => `${x.id} x${x.nodes.length}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  if (v.length) { bad++; console.log(`✗ /${pg} @${width}: ${v.join('; ')}`); }
  await ctx.close();
}
await browser.close(); server.close();
console.log(bad ? `a11y: ${bad} failing page/width combo(s)` : `✓ a11y: ${pages.length} page(s) × 2 widths, no serious or critical axe violations`);
process.exit(bad ? 1 : 0);
