import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { setup } from '../setup.mjs';
import { validate } from '../lib/schema.mjs';

const KIT = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(KIT, 'client.config.schema.json'), 'utf8'));
const acme = () => JSON.parse(fs.readFileSync(path.join(KIT, 'fixtures/acme/answers.json'), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tk-test-'));
const run = async (cfg, assets = path.join(KIT, 'fixtures/acme/assets')) => {
  const d = tmp(); const a = path.join(d, 'answers.json'); fs.writeFileSync(a, JSON.stringify(cfg));
  const r = await setup({ answers: a, assets, dryRun: true, skipOverflow: true, out: path.join(d, 'out') }, () => {}); return r;
};

test('schema: Delivery questionnaire keys 1-22 present in order; unknown keys rejected', async () => {
  const { keyMap } = await import('../lib/schema.mjs');
  const keys = keyMap(schema).q.map((x) => x[1]);
  assert.deepEqual(keys, ['business.name', 'business.owner', 'business.trade', 'contact.phone', 'contact.email', 'location.mapAddress', 'location.serviceArea', 'hours',
    'site.domain', 'brand.logo', 'services', 'features.chat', 'owner.loginEmail', 'payment.link', 'brand.photos', 'forms.destination', 'forms.turnstileSiteKey', 'forms.notifyEmail',
    'site.size', 'preview.url', 'feedback.approved', 'feedback.changes', 'feedback.missing']);
  assert.deepEqual([...new Set(keyMap(schema).q.map((x) => x[0]))], Array.from({ length: 21 }, (_, i) => i + 1)); // Q1-Q21, no gaps
  assert.ok(validate(schema, { ...acme(), extra: 1 }).some((e) => /unknown key/.test(e)));
});
test('Acme dry-run passes every check (one-page)', async () => { const r = await run(acme()); assert.deepEqual(r.fail, []); });
test('multi-page from site.size builds services/contact/gallery and passes', async () => {
  const c = acme(); c.site.size = 'multi-page'; const r = await run(c); assert.deepEqual(r.fail, []);
  for (const p of ['index.html', 'services/index.html', 'contact/index.html', 'gallery/index.html']) assert.ok(fs.existsSync(path.join(r.outDir, 'dist', p)), p);
});
test('the blank template config fails (placeholders)', async () => {
  const c = JSON.parse(fs.readFileSync(path.join(KIT, 'client.config.json'), 'utf8')); c.forms.turnstileSiteKey = '1x00000000000000000000AA'; c.contact.email = 'a@example.com';
  const r = await run(c); assert.ok(r.fail.includes('placeholder scan'), JSON.stringify(r.fail));
});
test('lorem / TODO in any field fails', async () => {
  for (const mut of [(c) => { c.services.push('Lorem ipsum'); }, (c) => { c.brand.tagline = 'TODO tagline'; }]) {
    const c = acme(); mut(c); assert.ok((await run(c)).fail.includes('placeholder scan'));
  }
});
test('photo over 4MB is resized under the cap', async () => {
  const d = tmp(); fs.mkdirSync(path.join(d, 'photos'));
  fs.copyFileSync(path.join(KIT, 'fixtures/acme/assets/logo.png'), path.join(d, 'logo.png'));
  const raw = Buffer.alloc(3000 * 2000 * 3); for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  await sharp(raw, { raw: { width: 3000, height: 2000, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path.join(d, 'photos/big.png'));
  assert.ok(fs.statSync(path.join(d, 'photos/big.png')).size > 4 * 1024 * 1024);
  const r = await run(acme(), d); assert.deepEqual(r.fail, []);
  const out = fs.readdirSync(path.join(r.outDir, 'dist/assets')).find((f) => f.startsWith('big'));
  assert.ok(fs.statSync(path.join(r.outDir, 'dist/assets', out)).size <= 4 * 1024 * 1024);
});
test('--deploy refuses with test Turnstile key / without approval env', async () => {
  const d = tmp(); const a = path.join(d, 'a.json'); fs.writeFileSync(a, JSON.stringify(acme()));
  const r = await setup({ answers: a, assets: path.join(KIT, 'fixtures/acme/assets'), deploy: true, skipOverflow: true, out: path.join(d, 'o') }, () => {});
  assert.ok(r.fail.some((f) => f.startsWith('deploy')));
});
test('chat widget off by default in template; map is click-to-load', async () => {
  const tpl = JSON.parse(fs.readFileSync(path.join(KIT, 'client.config.json'), 'utf8')); assert.equal(tpl.features.chat, false);
  const r = await run(acme()); const html = ['index.html', 'contact/index.html'].map((f) => path.join(r.outDir, 'dist', f)).filter(fs.existsSync).map((f) => fs.readFileSync(f, 'utf8')).join('');
  assert.ok(!/<iframe/.test(html) && /data-map-load/.test(html));
});

test('P2-1: placeholder failure writes NOTHING to --out and leaves no temp dir', async () => {
  for (const mut of [(c) => { c.hours = 'TBD'; }, (c) => { c.contact.phone = '(000) 000-0000'; }, (c) => { c.services.push('Lorem ipsum'); }, (c) => { c.owner.loginEmail = 'owner@example.com'; }]) {
    const d = tmp(); const a = path.join(d, 'a.json'); const c = acme(); mut(c); fs.writeFileSync(a, JSON.stringify(c));
    const out = path.join(d, 'clients', 'acme');
    const r = await setup({ answers: a, assets: path.join(KIT, 'fixtures/acme/assets'), skipOverflow: true, out }, () => {});
    assert.ok(r.fail.includes('placeholder scan'));
    assert.ok(!fs.existsSync(out), 'out dir must not exist after a failed build');
    assert.deepEqual(fs.readdirSync(path.join(d, 'clients')), [], 'temp build dir must be cleaned');
  }
});
test('P2-1: a failed re-run keeps the previous good build untouched', async () => {
  const d = tmp(); const out = path.join(d, 'clients', 'acme'); const a = path.join(d, 'a.json');
  fs.writeFileSync(a, JSON.stringify(acme()));
  assert.deepEqual((await setup({ answers: a, assets: path.join(KIT, 'fixtures/acme/assets'), dryRun: true, skipOverflow: true, out }, () => {})).fail, []);
  const before = fs.readFileSync(path.join(out, 'dist/index.html'), 'utf8');
  const bad = acme(); bad.hours = 'TBD'; fs.writeFileSync(a, JSON.stringify(bad));
  await setup({ answers: a, assets: path.join(KIT, 'fixtures/acme/assets'), dryRun: true, skipOverflow: true, out }, () => {});
  assert.equal(fs.readFileSync(path.join(out, 'dist/index.html'), 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(d, 'clients')), ['acme']);
});
test('P2-2: Q16 email goes in forms.notifyEmail, validated and tied to destination', async () => {
  const withEmail = acme(); withEmail.forms.destination = 'owner-dashboard+email'; withEmail.forms.notifyEmail = 'leads@acmetestco.test';
  const r = await run(withEmail); assert.deepEqual(r.fail, []);
  const w = JSON.parse(fs.readFileSync(path.join(r.outDir, 'wrangler.jsonc'), 'utf8'));
  assert.equal(w.vars.LEAD_NOTIFY_EMAIL, 'leads@acmetestco.test');
  const missing = acme(); missing.forms.destination = 'owner-dashboard+email'; assert.ok((await run(missing)).fail.includes('schema'));
  const badEmail = acme(); badEmail.forms.destination = 'owner-dashboard+email'; badEmail.forms.notifyEmail = 'not-an-email'; assert.ok((await run(badEmail)).fail.includes('schema'));
  const mismatch = acme(); mismatch.forms.notifyEmail = 'leads@acmetestco.test'; assert.ok((await run(mismatch)).fail.includes('schema'));
  const plain = await run(acme()); assert.equal(JSON.parse(fs.readFileSync(path.join(plain.outDir, 'wrangler.jsonc'), 'utf8')).vars.LEAD_NOTIFY_EMAIL, undefined);
});
test('P3 Q10: logo as "Y + link" or URL is refused with a clear message', async () => {
  for (const v of ['Y https://drive.google.com/x', 'https://example.test/logo.png', 'yes']) { const c = acme(); c.brand.logo = v; assert.ok((await run(c)).fail.includes('schema'), v); }
});
test('P3-3: wrangler.jsonc paths are local to the client folder; P3-4 favicon; Turnstile hostname var', async () => {
  const r = await run(acme()); const w = JSON.parse(fs.readFileSync(path.join(r.outDir, 'wrangler.jsonc'), 'utf8'));
  assert.equal(w.main, 'worker/index.mjs'); assert.equal(w.d1_databases[0].migrations_dir, 'worker/migrations');
  assert.ok(fs.existsSync(path.join(r.outDir, w.main)) && fs.existsSync(path.join(r.outDir, 'lib/headers.mjs')) && fs.existsSync(path.join(r.outDir, 'worker/migrations')));
  assert.equal(w.vars.TURNSTILE_HOSTNAME, 'acme-test-co-preview.ttawebdev.com');
  assert.ok(fs.existsSync(path.join(r.outDir, 'dist/favicon.svg')));
  assert.match(fs.readFileSync(path.join(r.outDir, 'dist/index.html'), 'utf8'), /<link rel="icon" href="\/favicon.svg"/);
});
test('preview menu: Owner demo + Client demo in main nav on every public page, never /owner/', async () => {
  for (const size of ['one-page', 'multi-page']) {
    const c = acme(); c.site.size = size; c.brand.photos = []; const r = await run(c);
    for (const f of ['index.html', '404.html', ...(size === 'multi-page' ? ['services/index.html', 'contact/index.html'] : [])]) {
      const h = fs.readFileSync(path.join(r.outDir, 'dist', f), 'utf8'); const nav = h.match(/<nav aria-label="Main">([\s\S]*?)<\/nav>/)[1];
      assert.match(nav, /href="\/demo\/owner\/">Owner demo</); assert.match(nav, /href="\/demo\/client\/">Client demo</); assert.ok(!/href="\/owner/.test(h), f);
    }
  }
});

test('schema: forms.notifyEmail optional for owner-dashboard, required + validated for owner-dashboard+email', async () => {
  const { validateConfig } = await import('../lib/schema.mjs');
  const c = acme(); assert.deepEqual(validateConfig(schema, c), []);                                  // absent, owner-dashboard: OK
  c.forms.notifyEmail = ''; assert.deepEqual(validateConfig(schema, c), []);                          // blank, owner-dashboard: OK
  const e = acme(); e.forms.destination = 'owner-dashboard+email';
  assert.ok(validateConfig(schema, e).some((x) => /notifyEmail: required/.test(x)));                  // missing: FAIL
  e.forms.notifyEmail = 'nope'; assert.ok(validateConfig(schema, e).some((x) => /notifyEmail: not an email/.test(x)));
  e.forms.notifyEmail = 'leads@acmetestco.test'; assert.deepEqual(validateConfig(schema, e), []);    // valid: OK, not an unknown key
});
