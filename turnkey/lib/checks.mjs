// Pre-deploy checks: placeholders, headers, links, gitleaks, overflow at 6 widths.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { REQUIRED_HEADERS } from './headers.mjs';

export const PLACEHOLDER_RE = /\bTODO\b|\bTBD\b|\bFIXME\b|lorem|ipsum|\bexample\.(com|org|net)\b|\bplaceholder\b|_{3,}|\bREPLACE\b|\(000\) 000-0000|\(XXX\)|sample tagline|your business name/i;
export const TURNSTILE_TEST_KEYS = ['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF'];

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, (t) => ' ' + [...t.matchAll(/\b(?:alt|title|aria-label|content|href)="([^"]*)"/g)].map((m) => m[1]).join(' ') + ' ');

export function placeholderScan(cfg, dist) {
  const hits = [];
  const scanVal = (v, p) => {
    if (p.startsWith('feedback') || p === 'preview.url') return; // workflow fields, not published
    if (typeof v === 'string') { if (PLACEHOLDER_RE.test(v)) hits.push(`config ${p}: "${v.slice(0, 60)}"`); }
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scanVal(x, p ? `${p}${Array.isArray(v) ? `[${k}]` : '.' + k}` : k);
  };
  scanVal(cfg, '');
  if (dist) for (const f of walk(dist).filter((f) => f.endsWith('.html'))) {
    const rel = path.relative(dist, f);
    if (rel.startsWith('demo' + path.sep)) continue; // demo pages are labelled sample data on purpose
    const m = visibleText(fs.readFileSync(f, 'utf8')).match(PLACEHOLDER_RE);
    if (m) hits.push(`${rel}: "${m[0]}"`);
  }
  return hits;
}

export function headerCheck(dist) {
  const errs = [];
  const h = fs.existsSync(path.join(dist, '_headers')) ? fs.readFileSync(path.join(dist, '_headers'), 'utf8') : '';
  if (!h) return ['_headers missing'];
  for (const k of REQUIRED_HEADERS) if (!new RegExp(`^\\s+${k}:`, 'mi').test(h)) errs.push(`_headers missing ${k}`);
  if (!/Strict-Transport-Security: max-age=300\b/.test(h)) errs.push('HSTS must be max-age=300');
  if (!/frame-ancestors 'none'/.test(h)) errs.push("CSP missing frame-ancestors 'none'");
  if (!/X-Robots-Tag: noindex/.test(h)) errs.push('X-Robots-Tag noindex missing');
  for (const f of walk(dist).filter((f) => f.endsWith('.html'))) if (!/<meta name="robots" content="noindex/.test(fs.readFileSync(f, 'utf8'))) errs.push(`${path.relative(dist, f)}: no meta noindex`);
  if (!/Disallow: \//.test(fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8'))) errs.push('robots.txt must Disallow /');
  return errs;
}

export function linkCheck(dist) {
  const errs = [];
  for (const f of walk(dist).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https:|tel:|mailto:|#)/.test(u)) continue;
      if (/^http:/.test(u)) { errs.push(`${path.relative(dist, f)}: insecure link ${u}`); continue; }
      if (u.startsWith('/cdn-cgi/')) continue;
      if (!u.startsWith('/')) { errs.push(`${path.relative(dist, f)}: relative link ${u}`); continue; }
      let p = path.join(dist, decodeURIComponent(u.split(/[?#]/)[0]));
      if (u.split(/[?#]/)[0].endsWith('/')) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) errs.push(`${path.relative(dist, f)}: broken link ${u}`);
    }
    for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!html.includes(`id="${m[1]}"`)) errs.push(`${path.relative(dist, f)}: missing anchor #${m[1]}`);
  }
  return errs;
}

export function gitleaks(target) {
  const r = spawnSync('gitleaks', ['dir', target, '--config', path.join(path.dirname(new URL(import.meta.url).pathname), '../.gitleaks.toml'), '--no-banner', '--redact', '--exit-code', '1', '--log-level', 'error'], { encoding: 'utf8' });
  if (r.error) return ['gitleaks not installed (required)'];
  return r.status === 0 ? [] : [`gitleaks found possible secrets in ${target} (redacted; run gitleaks dir ${target} --redact)`];
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
export async function overflowCheck(dist, widths = [360, 390, 412, 768, 820, 1024, 1280, 1440]) {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return { errs: ['playwright not installed'], ran: 0 }; }
  const server = http.createServer((req, res) => {
    let p = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p.endsWith(path.sep) || p.endsWith('/')) p = path.join(p, 'index.html');
    if (!p.startsWith(dist) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const pages = walk(dist).filter((f) => f.endsWith('.html')).map((f) => '/' + path.relative(dist, f).split(path.sep).join('/').replace(/index\.html$/, ''));
  const browser = await chromium.launch();
  const errs = []; let ran = 0;
  try {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      await ctx.route(/^https:\/\//, (r) => r.abort()); // offline: no third-party requests during checks
      const pg = await ctx.newPage();
      for (const u of pages) {
        await pg.goto(base + u, { waitUntil: 'load' });
        const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
        ran++;
        if (sw > w) errs.push(`${u} overflows at ${w}px (scrollWidth ${sw})`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  return { errs, ran };
}
