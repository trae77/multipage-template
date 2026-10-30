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
    'site.domain', 'brand.logo', 'services', 'features.chat', 'owner.loginEmail', 'payment.link', 'preview.url', 'feedback.approved', 'feedback.changes', 'feedback.missing',
    'brand.photos', 'forms.destination', 'forms.turnstileSiteKey', 'site.size']);
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
