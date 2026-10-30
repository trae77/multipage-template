#!/usr/bin/env node
// One-command client setup:
//   npm run setup -- --answers answers.json --assets dir/ [--dry-run] [--out dir] [--deploy]
// Validates answers against client.config.schema.json, copies/resizes logo + photos (<4MB each), writes the client config,
// builds the site, runs checks, and (only with --deploy) deploys to <slug>-preview.ttawebdev.com.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from './lib/schema.mjs';
import { render, writeDist, slugify } from './lib/build.mjs';
import { runQaGate } from './lib/qagate.mjs';
import { loginGate } from './lib/gate.mjs';
import { placeholderScan, headerCheck, linkCheck, gitleaks, overflowCheck, TURNSTILE_TEST_KEYS } from './lib/checks.mjs';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 4 * 1024 * 1024;
const IMG = /\.(jpe?g|png|webp)$/i;

function args(argv) {
  const o = { dryRun: false, deploy: false, skipOverflow: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true; else if (a === '--deploy') o.deploy = true;
    else if (a === '--skip-overflow') o.skipOverflow = true;
    else if (['--answers', '--assets', '--out', '--evidence'].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error('Unknown argument ' + a);
  }
  return o;
}

async function prepImage(src) {
  const buf = fs.readFileSync(src);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buf).metadata();
  if (buf.length <= MAX_BYTES && (meta.width || 0) <= 2400) return { buf, name: path.basename(src), resized: false };
  let q = 82, out;
  do { out = await sharp(buf).rotate().resize({ width: 2400, withoutEnlargement: true }).webp({ quality: q }).toBuffer(); q -= 12; } while (out.length > MAX_BYTES && q > 30);
  if (out.length > MAX_BYTES) throw new Error(`${src} still over 4MB after resize`);
  return { buf: out, name: path.basename(src).replace(/\.[^.]+$/, '') + '.webp', resized: true, from: buf.length, to: out.length };
}

const safeName = (n) => n.replace(/[^A-Za-z0-9._-]/g, '-');

export async function setup(o, log = console.log) {
  if (!o.answers) throw new Error('--answers <file> is required');
  const schema = JSON.parse(fs.readFileSync(path.join(KIT, 'client.config.schema.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(o.answers, 'utf8'));
  const report = { steps: [], fail: [] };
  const step = (name, errs, note = '') => { report.steps.push({ name, ok: !errs.length, note, errs }); log(`${errs.length ? 'FAIL' : 'PASS'}  ${name}${note ? '  (' + note + ')' : ''}`); errs.forEach((e) => log('      - ' + e)); if (errs.length) report.fail.push(name); };

  const vErrs = validate(schema, cfg);
  step('schema', vErrs);
  if (vErrs.length) return report;
  const slug = slugify(cfg.business.name);
  report.slug = slug;
  const outDir = path.resolve(o.out || (o.dryRun ? fs.mkdtempSync(path.join(os.tmpdir(), `turnkey-${slug}-`)) : path.join(process.cwd(), 'clients', slug)));
  report.outDir = outDir;
  log(`client: ${cfg.business.name}  slug: ${slug}  size: ${cfg.site.size}  out: ${outDir}${o.dryRun ? '  [DRY RUN]' : ''}`);

  // Assets
  const assets = {}; const aErrs = []; const notes = [];
  cfg._logoFile = ''; cfg._photoFiles = [];
  const dir = o.assets ? path.resolve(o.assets) : '';
  const logo = String(cfg.brand.logo || '').trim();
  if (logo && !/^n(o)?$/i.test(logo)) {
    const p = dir && path.join(dir, path.basename(logo));
    if (!p || !fs.existsSync(p)) aErrs.push(`logo "${logo}" not found in --assets`);
    else if (/\.svg$/i.test(p)) { const s = fs.readFileSync(p, 'utf8'); if (/<script|on\w+=|javascript:/i.test(s)) aErrs.push('logo SVG contains script'); else { cfg._logoFile = safeName(path.basename(p)); assets[cfg._logoFile] = Buffer.from(s); } }
    else { const r = await prepImage(p); cfg._logoFile = safeName(r.name); assets[cfg._logoFile] = r.buf; if (r.resized) notes.push(`logo resized ${r.from}->${r.to} bytes`); }
  }
  let photos = cfg.brand.photos || [];
  if (!photos.length && dir && fs.existsSync(path.join(dir, 'photos'))) photos = fs.readdirSync(path.join(dir, 'photos')).filter((f) => IMG.test(f)).sort().map((f) => 'photos/' + f);
  for (const ph of photos) {
    const p = path.join(dir, ph.replace(/\.\.+/g, ''));
    if (!dir || !p.startsWith(dir) || !fs.existsSync(p) || !IMG.test(p)) { aErrs.push(`photo "${ph}" not found or not jpg/png/webp`); continue; }
    const r = await prepImage(p); const n = safeName(r.name); cfg._photoFiles.push(n); assets[n] = r.buf;
    if (r.resized) notes.push(`${ph} resized ${(r.from / 1048576).toFixed(1)}MB->${(r.to / 1048576).toFixed(2)}MB`);
  }
  for (const [n, b] of Object.entries(assets)) if (b.length > MAX_BYTES) aErrs.push(`${n} over 4MB`);
  step('assets', aErrs, `${cfg._logoFile ? 'logo + ' : 'no logo, '}${cfg._photoFiles.length} photo(s)${notes.length ? '; ' + notes.join('; ') : ''}`);

  // Write config + build
  fs.mkdirSync(outDir, { recursive: true });
  const { _logoFile, _photoFiles, ...clean } = cfg;
  fs.writeFileSync(path.join(outDir, 'client.config.json'), JSON.stringify(clean, null, 2) + '\n');
  const dist = path.join(outDir, 'dist');
  const files = render(cfg);
  writeDist(files, dist, assets);
  step('build', [], `${Object.keys(files).length + Object.keys(assets).length} files -> dist/`);
  fs.writeFileSync(path.join(outDir, 'wrangler.jsonc'), wranglerConfig(slug, cfg, path.relative(outDir, path.join(KIT, 'worker/index.mjs')), path.relative(outDir, path.join(KIT, 'worker/migrations'))));

  // Checks
  const g = loginGate(dist); g.notes.forEach((n) => log('NOTE  ' + n));
  step(`login-safety gate (${g.checks.length - g.errs.length}/${g.checks.length})`, g.errs.map((e) => 'missing/disabled: ' + e));
  step('placeholder scan', placeholderScan(clean, dist));
  step('header check', headerCheck(dist));
  step('link check', linkCheck(dist));
  step('gitleaks', [...gitleaks(dist), ...gitleaks(path.join(outDir, 'client.config.json'))]);
  if (o.skipOverflow) step('overflow 360/390/412/768/820/1024/1280/1440', [], 'skipped (--skip-overflow)');
  else { const ov = await overflowCheck(dist); step('overflow 360/390/412/768/820/1024/1280/1440', ov.errs, `${ov.ran} page loads`); }
  // ops/standards qa-gate.sh against a local preview (real Worker + dist). Automated items must PASS;
  // manual DoD items come from <out>/EVIDENCE.md and are only required for a real (non-dry-run) setup/deploy.
  const evPath = o.evidence || path.join(outDir, 'EVIDENCE.md');
  if (!fs.existsSync(evPath)) fs.writeFileSync(evPath, `# DoD evidence: ${cfg.business.name} (fill each line as "KEY: PASS <proof>" or "KEY: N/A <reason>"; see turnkey/qa/DEFINITION-OF-DONE.md)\n` + ['A1','A2','A3','A4','A6','A7','C1','C2','D1','E1','E2','G1','H1','H2','U1'].map((k) => `${k}:`).join('\n') + '\n');
  const qg = await runQaGate(dist, o.evidence || path.join(outDir, 'EVIDENCE.md'), clean);
  const autoFails = qg.fails.filter((l) => !/manual evidence missing/.test(l));
  const manual = qg.fails.filter((l) => /manual evidence missing/.test(l));
  step('qa-gate.sh (automated items)', autoFails, `${qg.passes} PASS`);
  if (manual.length) { if (o.dryRun) log(`PENDING  qa-gate.sh manual DoD evidence: ${manual.map((l) => l.split(' ')[1]).join(' ')} (fill ${path.join(outDir, 'EVIDENCE.md')})`); else step('qa-gate.sh (manual DoD evidence)', manual); }
  const tsTest = TURNSTILE_TEST_KEYS.includes(cfg.forms.turnstileSiteKey);
  if (tsTest) log('WARN  forms.turnstileSiteKey is a Cloudflare TEST key (always passes). Fine for --dry-run; --deploy refuses it.');

  if (o.deploy) {
    const dErrs = [];
    if (o.dryRun) dErrs.push('--deploy and --dry-run together: refusing');
    if (report.fail.length) dErrs.push('checks failed: ' + report.fail.join(', '));
    if (tsTest) dErrs.push('real Turnstile site key required');
    for (const v of ['D1_DATABASE_ID', 'ACCESS_AUD']) if (!process.env[v]) dErrs.push(`env ${v} not set`);
    if (process.env.TURNKEY_DEPLOY_OK !== 'yes') dErrs.push('set TURNKEY_DEPLOY_OK=yes only after William approves this deploy');
    if (!dErrs.length) {
      const r = spawnSync('npx', ['wrangler', 'deploy', '--config', path.join(outDir, 'wrangler.jsonc')], { stdio: 'inherit', cwd: outDir });
      if (r.status !== 0) dErrs.push('wrangler deploy failed');
    }
    step(`deploy -> https://${slug}-preview.ttawebdev.com`, dErrs);
  } else log(`SKIP  deploy (no --deploy). Target would be https://${slug}-preview.ttawebdev.com`);
  log(report.fail.length ? `RESULT: FAIL (${report.fail.join(', ')})` : 'RESULT: PASS');
  return report;
}

function wranglerConfig(slug, cfg, main, migrations) {
  return JSON.stringify({
    $comment: 'Generated by turnkey setup. Secrets (TURNSTILE_SECRET) are set with `wrangler secret put`, never here. D1 id and Access AUD come from env at deploy.',
    name: `${slug}-preview`, main, compatibility_date: '2025-09-01', workers_dev: false,
    routes: [{ pattern: `${slug}-preview.ttawebdev.com`, custom_domain: true }],
    assets: { directory: 'dist', binding: 'ASSETS', run_worker_first: true, not_found_handling: '404-page' },
    vars: { OWNER_EMAILS: cfg.owner.loginEmail, ACCESS_TEAM: 'https://green-sound-e085.cloudflareaccess.com', ACCESS_AUD: process.env.ACCESS_AUD || '' },
    d1_databases: [{ binding: 'DB', database_name: `${slug}-preview`, database_id: process.env.D1_DATABASE_ID || '', migrations_dir: migrations }],
  }, null, 2) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let o; try { o = args(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  setup(o).then((r) => process.exit(r.fail.length ? 1 : 0)).catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
