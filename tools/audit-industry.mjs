#!/usr/bin/env node
// Scan built HTML for features that leaked across industries (tools/industry-features.json "markers").
//   npm run audit:industry                 # samples/, template folders, prospects/
//   node tools/audit-industry.mjs <dir|file> ...   (also used by multipage-template on dist-demo/)
// A page's industry comes from: build.json {trade} next to it (multipage), else its folder name
// (samples/<trade>, samples/design-<trade>-<layout>, <template-folder>), else its JSON-LD @type.
// Exit 1 when anything leaked.
import fs from 'node:fs';
import path from 'node:path';
import { tradeOfFile, scanHtml } from './industry.vendor.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function htmlFiles(p) {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return p.endsWith('.html') ? [p] : [];
  return fs.readdirSync(p, { recursive: true }).filter((f) => f.endsWith('.html') && !/node_modules|\.git\//.test(f)).map((f) => path.join(p, f));
}
const argv = process.argv.slice(2).filter((a) => a !== '--strict');
const targets = argv.length ? argv
  : ['dist-demo', 'dist'].map((d) => path.join(ROOT, d));
let n = 0; let missing = 0; const bad = [];
const STRICT = process.argv.includes('--strict');
for (const t of targets) for (const f of htmlFiles(path.resolve(t))) {
  if (/\/(admin|portal|login|widgets|upgrade)\//.test(f)) continue;
  const [t, why, allow, problems = []] = tradeOfFile(f); n++;
  // pageTradeRecord: a conflict between record sources always fails; a missing record fails in CI / --strict, warns locally.
  const recordHits = problems.filter((p) => p.startsWith('trade record conflict') || ((process.env.CI || STRICT) && p.startsWith('no trade record')));
  if (problems.length && !recordHits.length) missing++;
  const hits = scanHtml(fs.readFileSync(f, 'utf8'), t, allow);
  hits.push(...recordHits);
  { // compliance audit 2026-10-19 #7: no sample ratings in schema or demo data; SMS consent never pre-checked
    const h = fs.readFileSync(f, 'utf8');
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) if (/"(aggregateRating|review|reviewRating)"/.test(m[1])) hits.push('rating/review in JSON-LD (never ship schema ratings)');
    if (/"rating"\s*:\s*\d[^}]*"sample"\s*:\s*true|"sample"\s*:\s*true[^}]*"rating"\s*:\s*\d/.test(h)) hits.push('sample review carries a star rating');
    if (/name="sms_consent"[^>]*\bchecked/.test(h)) hits.push('SMS consent box pre-checked');
  }
  if (hits.length) bad.push(`${path.relative(process.cwd(), f)} [${t.id} via ${why}]\n      ${hits.join('\n      ')}`);
}
console.log(`audit:industry scanned ${n} page(s)${missing ? `; ${missing} without a trade record (warning; fails in CI or with --strict)` : ''}`);
if (bad.length) { console.error(`✗ ${bad.length} page(s) show features from another industry:\n  - ${bad.join('\n  - ')}`); process.exit(1); }
console.log('✓ no cross-industry features found');
