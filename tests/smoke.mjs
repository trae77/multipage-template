// Playwright smoke test of the static demo build at 390px and 1440px.
import { chromium } from 'playwright'; import assert from 'node:assert/strict'; import path from 'node:path'; import url from 'node:url';
import { serve } from './serve.mjs';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const srv = process.env.BASE_URL ? { url: process.env.BASE_URL.replace(/\/?$/, '/'), close() {} } : await serve(path.join(ROOT, 'dist-demo'));
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

  for (const p of ['', 'services/', 'about/', 'gallery/', 'quote/', 'reviews/', 'service-area/', 'faq/', 'blog/', 'blog/welcome/', 'contact/', 'login/'])
    await step(`page /${p} loads, demo banner, no overflow, labeled inputs`, async () => {
      await go(p); assert.match(await page.locator('.demo-banner').innerText(), /Demo mode, sample data/); await noOverflow();
      const unlabeled = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter((e) => !e.labels?.length && !e.getAttribute('aria-label')).length);
      assert.equal(unlabeled, 0, 'unlabeled form fields'); assert.equal(await page.locator('h1').count(), 1);
    });
  await step('service detail page from services list', async () => { await go('services/'); await page.locator('.card a.more').first().click(); await page.waitForLoadState(); assert.ok(page.url().includes('/services/') && (await page.locator('h1').innerText()).length > 2); });
  if (width < 500) await step('labeled Menu button opens sheet, Escape closes, call bar Call/Text/CTA 48px', async () => { await go(''); const b = page.locator('.menu-btn'); assert.equal((await b.innerText()).trim(), 'Menu');
    await b.click(); assert.ok(await page.locator('#menu-sheet').isVisible()); assert.equal(await b.getAttribute('aria-expanded'), 'true'); await page.keyboard.press('Escape'); assert.ok(!(await page.locator('#menu-sheet').isVisible()));
    const bar = await page.locator('.call-bar a').allInnerTexts(); assert.deepEqual(bar, ['Call', 'Text', 'Get a Quote']);
    const h = await page.locator('.call-bar a').evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height))); assert.ok(h >= 48, 'bar height ' + h); });
  else await step('desktop nav: <=6 links + phone + CTA, no Menu button', async () => { await go(''); assert.ok((await page.locator('.nav-desktop a').count()) <= 6); assert.ok(await page.locator('.hdr-cta').isVisible()); assert.ok(!(await page.locator('.menu-btn').isVisible())); });
  await step('gallery filter + lightbox', async () => { await go('gallery/'); await page.click('.chip[data-cat="Replacement"]'); assert.equal(await page.locator('[data-gallery] .card:visible').count(), 1);
    await page.click('[data-gallery] .card:visible .zoom'); assert.ok(await page.locator('#lightbox').isVisible()); await page.keyboard.press('Escape'); });
  await step('quote builder sends a quote lead', async () => { await go('quote/'); await page.fill('#qf-size', '1200'); assert.match(await page.locator('#quote-summary').innerText(), /1200/);
    await page.fill('#qf-name', 'Quote Person'); await page.fill('#qf-phone', '555-0002'); await page.click('#quote-form button[type=submit]'); assert.match(await page.locator('#quote-form .status').innerText(), /Thanks/); });
  await step('blog post has Article JSON-LD + CTA box', async () => { await go('blog/welcome/'); assert.ok(await page.locator('.cta-box').count()); const t = await page.locator('script[type="application/ld+json"]').allTextContents(); assert.ok(t.some((x) => JSON.parse(x)['@type'] === 'Article')); });
  await step('restaurant demo: menu anchors + order cart → owner inbox', async () => { await go('demos/restaurant/menu/'); assert.ok(await page.locator('#mains').count());
    await go('demos/restaurant/order/'); await page.click('[data-add="m1"]'); await page.click('[data-add="m3"]'); assert.equal(await page.locator('#cart li').count(), 2);
    await page.fill('#of-name', 'Order Person'); await page.fill('#of-phone', '555-0003'); await page.click('#order-form button[type=submit]'); assert.match(await page.locator('#order-form .status').innerText(), /Order request sent/);
    await go('demos/restaurant/login/'); await page.fill('#li-email', 'owner@demo.test'); await page.fill('#li-pass', 'demo-owner'); await page.click('#login-form button'); await page.waitForURL(/admin\//); await page.click('[data-tab=leads]'); await page.waitForSelector('text=Order Person'); await page.click('#logout'); });
  for (const [t, p, re] of [['fitness', 'schedule/', /Sample class/], ['real-estate', 'listings/', /Sample listing/], ['real-estate', 'listings/sample-1/', /ask the agent/], ['photography', 'packages/', /Sample package/], ['salon-barber', 'book/', /Book a visit/], ['dental-medical', 'portal/', /patient portal/i]])
    await step(`${t} demo: /${p}`, async () => { await go(`demos/${t}/${p}`); assert.match(await page.locator('main').innerText(), re); await noOverflow(); });
  await step('dental demo has no customer portal link in nav', async () => { await go('demos/dental-medical/'); assert.equal(await page.locator('.hdr-cta').innerText(), 'Request a Visit'); });
  for (const [t, layout, hero] of [['restaurant', 'rest-order', 'menu-first'], ['fitness', 'fit-schedule', 'schedule'], ['real-estate', 're-search', 'search'], ['photography', 'photo-portfolio', 'portfolio'], ['salon-barber', 'salon-book', 'centered'], ['dental-medical', 'care-visit', 'centered']])
    await step(`${t} home: layout ${layout}, hero ${hero}, 5-second test`, async () => { await go(`demos/${t}/`); assert.equal(await page.locator(`section.hero--${hero}`).count(), 1);
      const hero1 = page.locator('section.hero'); assert.match(await hero1.innerText(), /Denver/); assert.ok(await hero1.locator(`a[href^="tel:"], a.btn`).count()); await noOverflow();
      const ids = await page.locator('main > section[id]').evaluateAll((els) => els.map((e) => e.id)); assert.equal(ids[0], 'hero'); assert.equal(ids.at(-1), 'contact'); });
  await step('main roofing home unchanged (no layout set)', async () => { await go(''); assert.equal(await page.locator('section[class*="hero--"]').count(), 0); });
  await step('real-estate hero search filters listings', async () => { await go('demos/real-estate/'); await page.fill('#hs-q', 'condo'); await page.click('.hero-search button'); await page.waitForURL(/listings\/\?q=condo/); assert.equal(await page.locator('main .grid > .card:visible').count(), 1); });
  await step('no FAQPage markup by default', async () => { await go('faq/'); const all = await page.locator('script[type="application/ld+json"]').allTextContents(); assert.ok(!all.some((t) => t.includes('FAQPage'))); });
  await step('combo nav: 2-3 visible links + Menu on phones', async () => { await go(''); const n = await page.locator('.nav-priority a:visible').count(); if ((page.viewportSize()?.width || 0) < 1024) { assert.ok(n >= 2 && n <= 3, String(n)); assert.ok(await page.locator('.menu-btn:visible').count() === 1); } else assert.equal(n, 0); });
  await step('SEO: JSON-LD LocalBusiness + meta description', async () => { await go(''); const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent()); assert.equal(ld['@type'], 'RoofingContractor'); assert.ok(!('aggregateRating' in ld) && !('review' in ld)); assert.ok(await page.locator('meta[name=description]').getAttribute('content')); });
  await step('quote form submits to leads', async () => { await go('contact/'); await page.click('button[type=submit]'); assert.match(await page.locator('.status').innerText(), /fill in/);
    await page.fill('#lf-name', 'Smoke Lead'); await page.fill('#lf-phone', '555-0000'); await page.fill('#lf-msg', 'Smoke test request'); await page.click('button[type=submit]'); assert.match(await page.locator('.status').innerText(), /Thanks/); });
  await step('booking picks a slot (salon demo; roofing has no booking page per spec v5)', async () => { await go('demos/salon-barber/book/'); await page.fill('#bk-date', nextBookable()); await page.dispatchEvent('#bk-date', 'change');
    await page.locator('#bk-slots button:not([disabled])').first().click(); await page.fill('#bk-name', 'Smoke Booker'); await page.fill('#bk-phone', '555-0001'); await page.click('#book-form button[type=submit]'); assert.match(await page.locator('#book-form .status').innerText(), /Requested/); });
  await step('salon owner sees the booking', async () => { await go('demos/salon-barber/login/'); await page.fill('#li-email', 'owner@demo.test'); await page.fill('#li-pass', 'demo-owner'); await page.click('#login-form button'); await page.waitForURL(/admin\//);
    await page.click('[data-tab=bookings]'); await page.waitForSelector('text=Smoke Booker'); await go('demos/salon-barber/login/'); const lo = page.locator('[data-logout], button:has-text("Log out")').first(); if (await lo.count()) await lo.click().catch(() => {}); });
  await step('spec v5: no booking or menu on roofing / restaurant', async () => { await go(''); assert.equal(await page.locator('a[href$="book/"]').count(), 0); assert.equal(await page.locator('#menu, a[href$="menu/"]').count(), 0);
    await go('demos/restaurant/'); assert.equal(await page.locator('a[href$="book/"]').count(), 0); });
  await step('owner login → dashboard: lead visible, build + send quote', async () => {
    await go('login/'); assert.match(await page.locator('.demo-logins').innerText(), /owner@demo\.test/);
    await page.fill('#li-email', 'owner@demo.test'); await page.fill('#li-pass', 'demo-owner'); await page.click('#login-form button'); await page.waitForURL(/admin\//);
    await page.waitForSelector('.stats'); await page.click('[data-tab=leads]'); await page.waitForSelector('text=Smoke Lead');
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
