// Playwright smoke test of the static demo build at 390px and 1440px.
import { chromium } from 'playwright'; import assert from 'node:assert/strict'; import path from 'node:path'; import url from 'node:url';
import { serve } from './serve.mjs';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const srv = await serve(path.join(ROOT, 'dist-demo'));
const browser = await chromium.launch();
let failures = 0;
const step = async (name, fn) => { try { await fn(); console.log('  ok  ', name); } catch (e) { failures++; console.log('  FAIL', name, '\n       ', e.message.split('\n')[0]); } };
const nextBookable = () => { const d = new Date(); for (let i = 1; i < 30; i++) { d.setDate(d.getDate() + 1); if (d.getDay() >= 1 && d.getDay() <= 5 && i >= 1) return d.toISOString().slice(0, 10); } };

for (const width of [390, 1440]) {
  console.log(`\nViewport ${width}px`);
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const go = (p) => page.goto(srv.url + p, { waitUntil: 'load' });
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'horizontal overflow');

  for (const p of ['', 'services/', 'about/', 'projects/', 'reviews/', 'service-area/', 'faq/', 'blog/', 'blog/welcome/', 'contact/', 'book/', 'login/'])
    await step(`page /${p} loads, demo banner, no overflow, labeled inputs`, async () => {
      await go(p); assert.match(await page.locator('.demo-banner').innerText(), /Demo mode, sample data/); await noOverflow();
      const unlabeled = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter((e) => !e.labels?.length && !e.getAttribute('aria-label')).length);
      assert.equal(unlabeled, 0, 'unlabeled form fields'); assert.equal(await page.locator('h1').count(), 1);
    });
  await step('service detail page from services list', async () => { await go('services/'); await page.locator('.card a.more').first().click(); await page.waitForLoadState(); assert.ok(page.url().includes('/services/') && (await page.locator('h1').innerText()).length > 2); });
  if (width < 500) await step('mobile nav toggle + call bar', async () => { await go(''); await page.click('.nav-toggle'); assert.ok(await page.locator('#site-nav').isVisible()); assert.ok(await page.locator('.call-bar').isVisible()); });
  await step('SEO: JSON-LD LocalBusiness + meta description', async () => { await go(''); const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent()); assert.equal(ld['@type'], 'LocalBusiness'); assert.ok(await page.locator('meta[name=description]').getAttribute('content')); });
  await step('quote form submits to leads', async () => { await go('contact/'); await page.click('button[type=submit]'); assert.match(await page.locator('.status').innerText(), /fill in/);
    await page.fill('#lf-name', 'Smoke Lead'); await page.fill('#lf-phone', '555-0000'); await page.fill('#lf-msg', 'Smoke test request'); await page.click('button[type=submit]'); assert.match(await page.locator('.status').innerText(), /Thanks/); });
  await step('booking picks a slot', async () => { await go('book/'); await page.fill('#bk-date', nextBookable()); await page.dispatchEvent('#bk-date', 'change');
    await page.locator('#bk-slots button:not([disabled])').first().click(); await page.fill('#bk-name', 'Smoke Booker'); await page.fill('#bk-phone', '555-0001'); await page.click('#book-form button[type=submit]'); assert.match(await page.locator('#book-form .status').innerText(), /Requested/); });
  await step('owner login → dashboard: lead visible, build + send quote', async () => {
    await go('login/'); assert.match(await page.locator('.demo-logins').innerText(), /owner@demo\.test/);
    await page.fill('#li-email', 'owner@demo.test'); await page.fill('#li-pass', 'demo-owner'); await page.click('#login-form button'); await page.waitForURL(/admin\//);
    await page.waitForSelector('.stats'); await page.click('[data-tab=leads]'); await page.waitForSelector('text=Smoke Lead');
    await page.click('[data-tab=bookings]'); await page.waitForSelector('text=Smoke Booker');
    await page.click('[data-tab=quotes]'); await page.fill('#qb-t', 'Smoke quote'); await page.fill('#ld-1', 'Smoke line'); await page.fill('#lq-1', '2'); await page.fill('#lu-1', '10');
    assert.equal(await page.locator('#qb-total').innerText(), '$20.00'); await page.click('#qb button[value=sent]'); await page.waitForSelector('h3:has-text("Smoke quote")');
    await page.click('[data-tab=posts]'); await page.fill('#pf-t', 'Smoke post'); await page.fill('#pf-b', 'Hello **world**'); await page.click('#pf button[type=submit]'); await page.waitForSelector('text=Smoke post');
    await page.click('[data-tab=content]'); await page.fill('#sc-h', 'Edited headline'); await page.click('#sc button[type=submit]'); await page.waitForSelector('text=Saved');
    await noOverflow(); await page.click('#logout'); await page.waitForURL(/login\//);
  });
  await step('edited content shows on public pages', async () => { await go(''); await page.waitForSelector('h1:has-text("Edited headline")'); await go('blog/'); await page.waitForSelector('text=Smoke post'); });
  await step('customer portal: accept quote, pay disabled, message, upload photo', async () => {
    await go('login/'); await page.fill('#li-email', 'customer@demo.test'); await page.fill('#li-pass', 'demo-customer'); await page.click('#login-form button'); await page.waitForURL(/portal\//);
    await page.click('[data-tab=quotes]'); await page.locator('article:has-text("Smoke quote") [data-acc]').click(); await page.waitForSelector('article:has-text("Smoke quote") .pill:has-text("accepted")');
    await page.click('[data-tab=invoices]'); assert.ok(await page.locator('button:has-text("Pay invoice")').first().isDisabled());
    await page.click('[data-tab=messages]'); await page.fill('#msg-body', 'Smoke message'); await page.click('#msg-form button'); await page.waitForSelector('.msg:has-text("Smoke message")');
    await page.click('[data-tab=jobs]'); await page.setInputFiles('input[type=file]', { name: 'p.png', mimeType: 'image/png', buffer: PNG }); await page.click('[data-up] button'); await page.waitForSelector('.thumbs img');
    await noOverflow(); await page.click('#logout');
  });
  await step('portal blocked when logged out', async () => { await go('admin/'); await page.waitForURL(/login\//); });
  await step('no JS errors', async () => assert.deepEqual(errors, []));
  await ctx.close();
}
await browser.close(); srv.close();
console.log(failures ? `\n${failures} failure(s)` : '\nAll smoke checks passed'); process.exit(failures ? 1 : 0);
