// Renders a complete static client site + demo dashboards + owner page from client.config.json into dist/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOW_REAL_LOGINS, SHOW_DEMO_NAV } from './flags.mjs';
import { headersFile } from './headers.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const telHref = (p) => 'tel:+1' + String(p).replace(/\D/g, '');

function paymentBlock(link) {
  const l = String(link || '').trim();
  if (!l) return '<p>Payment link pending.</p>';
  if (/^https:\/\/[^\s"'<>]+$/.test(l)) return `<p><a class="btn" href="${esc(l)}" rel="noopener noreferrer" target="_blank">Pay online</a></p>`;
  return `<p>Pay by Zelle: <strong>${esc(l)}</strong></p>`;
}

function mapBlock(addr) {
  if (!addr) return '';
  const src = 'https://www.google.com/maps?q=' + encodeURIComponent(addr) + '&output=embed';
  // Privacy-safe: no request to Google until the visitor clicks. Then a lazy, no-referrer iframe is inserted by site.js.
  return `<section id="map" class="card"><h2>Find us</h2><p>${esc(addr)}</p>
<div class="map" data-map-src="${esc(src)}" data-map-title="Map of ${esc(addr)}"><button type="button" class="btn ghost" data-map-load>Show map (loads Google Maps)</button></div></section>`;
}

function leadForm(cfg) {
  const opts = cfg.services.map((s) => `<option>${esc(s)}</option>`).join('');
  return `<section id="contact" class="card"><h2>Request a free estimate</h2>
<form id="lead-form" novalidate>
<label>Name<input name="name" required maxlength="80" autocomplete="name"></label>
<label>Email<input name="email" type="email" required maxlength="120" autocomplete="email"></label>
<label>Phone<input name="phone" type="tel" maxlength="25" autocomplete="tel"></label>
<label>Service<select name="service"><option value="">Choose one</option>${opts}</select></label>
<label>Details<textarea name="details" required minlength="5" maxlength="4000" rows="4"></textarea></label>
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="cf-turnstile" data-sitekey="${esc(cfg.forms.turnstileSiteKey)}"></div>
<button type="submit" class="btn">Send request</button>
<p class="form-status" role="status" aria-live="polite"></p>
</form><p class="small">Or call <a href="${telHref(cfg.contact.phone)}">${esc(cfg.contact.phone)}</a>.</p></section>`;
}

function page(cfg, { title, body, nav, depth = 0, extraHead = '', turnstile = false }) {
  const up = depth ? '../'.repeat(depth) : './';
  const logo = cfg._logoFile ? `<img src="/assets/${esc(cfg._logoFile)}" alt="${esc(cfg.business.name)} logo" width="40" height="40">` : '';
  const footLinks = SHOW_REAL_LOGINS ? '<a href="/owner/">Owner login</a>' : '';
  const demoNav = SHOW_DEMO_NAV ? '<a href="/demo/owner/">Owner demo</a><a href="/demo/client/">Client demo</a>' : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<meta name="description" content="${esc(cfg.business.name)}: ${esc(cfg.business.trade)} serving ${esc(cfg.location.serviceArea)}.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css">${extraHead}</head>
<body${cfg.features.chat ? ' data-chat="on"' : ''}>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><a class="brand" href="/">${logo}<span>${esc(cfg.business.name)}</span></a>
<nav aria-label="Main">${nav}${demoNav}</nav>
<a class="btn call" href="${telHref(cfg.contact.phone)}">Call ${esc(cfg.contact.phone)}</a></header>
<main id="main">${body}</main>
<footer><p><strong>${esc(cfg.business.name)}</strong> · ${esc(cfg.business.trade)} · ${esc(cfg.location.serviceArea)}</p>
<p>${esc(cfg.hours)} · <a href="${telHref(cfg.contact.phone)}">${esc(cfg.contact.phone)}</a> · <a href="mailto:${esc(cfg.contact.email)}">${esc(cfg.contact.email)}</a></p>
${cfg.business.licenseInsured ? `<p>${esc(cfg.business.licenseInsured)}</p>` : ''}${footLinks ? `<p>${footLinks}</p>` : ''}
<p class="small">&copy; ${new Date().getFullYear()} ${esc(cfg.business.name)}</p></footer>
${cfg.features.chat ? '<div id="chat-root"></div>' : ''}
<script id="site-data" type="application/json">${JSON.stringify({ name: cfg.business.name, phone: cfg.contact.phone, hours: cfg.hours, area: cfg.location.serviceArea, services: cfg.services }).replace(/</g, '\\u003c')}</script>
<script src="/site.js" defer></script>${turnstile ? '\n<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
</body></html>
`;
}

const sections = {
  hero: (c) => `<section class="hero"><h1>${esc(c.business.name)}</h1><p class="lead">${esc(c.brand.tagline || `${c.business.trade} serving ${c.location.serviceArea}`)}</p>
<p><a class="btn" href="#contact">Get a free estimate</a> <a class="btn ghost" href="tel:+1${c.contact.phone.replace(/\D/g, '')}">Call now</a></p></section>`,
  services: (c) => `<section id="services" class="card"><h2>Services</h2><ul class="grid">${c.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>`,
  info: (c) => `<section id="about" class="card"><h2>About ${esc(c.business.name)}</h2><p>Owner: ${esc(c.business.owner)}</p>
<p>Service area: ${esc(c.location.serviceArea)}</p><p>Hours: ${esc(c.hours)}</p></section>`,
  gallery: (c) => (c._photoFiles.length ? `<section id="gallery" class="card"><h2>Our work</h2><div class="gallery">${c._photoFiles.map((f, i) =>
    `<img src="/assets/${esc(f)}" alt="${esc(c.business.name)} project photo ${i + 1}" loading="lazy" decoding="async">`).join('')}</div></section>` : ''),
  pay: (c) => `<section id="pay" class="card"><h2>Payments</h2>${paymentBlock(c.payment.link)}</section>`,
};

// P3-4: every page links a favicon (brand-colour tile + first letter); no more /favicon.ico 404s.
export function favicon(cfg) {
  const color = /^#[0-9a-fA-F]{6}$/.test(cfg.brand.primaryColor || '') ? cfg.brand.primaryColor : '#1f4e79';
  const letter = esc((String(cfg.business.name).match(/[A-Za-z0-9]/) || ['T'])[0].toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color}"/><text x="32" y="44" font-family="Arial,sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>\n`;
}

export function render(cfg) {
  const files = {};
  const size = cfg.site.size;
  if (size === 'multi-page') {
    const links = [['/', 'Home'], ['/services/', 'Services'], cfg._photoFiles.length ? ['/gallery/', 'Our work'] : null, ['/contact/', 'Contact']].filter(Boolean);
    const nav = links.map(([h, t]) => `<a href="${h}">${t}</a>`).join('');
    const home = sections.hero(cfg).replace('href="#contact"', 'href="/contact/"') + sections.services(cfg) + sections.info(cfg);
    files['index.html'] = page(cfg, { title: `${cfg.business.name} | ${cfg.business.trade}`, body: home, nav });
    files['services/index.html'] = page(cfg, { title: `Services | ${cfg.business.name}`, body: sections.services(cfg) + sections.pay(cfg), nav, depth: 1 });
    if (cfg._photoFiles.length) files['gallery/index.html'] = page(cfg, { title: `Our work | ${cfg.business.name}`, body: sections.gallery(cfg), nav, depth: 1 });
    files['contact/index.html'] = page(cfg, { title: `Contact | ${cfg.business.name}`, body: leadForm(cfg) + mapBlock(cfg.location.mapAddress) + sections.info(cfg), nav, depth: 1, turnstile: true });
  } else {
    const nav = ['#services', 'Services', '#about', 'About', cfg._photoFiles.length ? '#gallery' : '', 'Our work', '#contact', 'Contact']
      .reduce((a, v, i, arr) => (i % 2 === 0 && v ? a + `<a href="${v}">${arr[i + 1]}</a>` : a), '');
    const body = sections.hero(cfg) + sections.services(cfg) + sections.info(cfg) + sections.gallery(cfg) + leadForm(cfg) + mapBlock(cfg.location.mapAddress) + sections.pay(cfg);
    files['index.html'] = page(cfg, { title: `${cfg.business.name} | ${cfg.business.trade}`, body, nav, turnstile: true });
  }
  files['404.html'] = page(cfg, { title: `Not found | ${cfg.business.name}`, body: '<section class="card"><h1>Page not found</h1><p><a href="/">Back to home</a></p></section>', nav: '<a href="/">Home</a>' });
  files['favicon.svg'] = favicon(cfg);
  files['robots.txt'] = 'User-agent: *\nDisallow: /\n';
  files['_headers'] = headersFile();
  const color = cfg.brand.primaryColor || '#1f4e79';
  files['site.css'] = fs.readFileSync(path.join(KIT, 'static/site.css'), 'utf8').replace('--brand:#1f4e79', `--brand:${color}`);
  files['site.js'] = fs.readFileSync(path.join(KIT, 'static/site.js'), 'utf8');
  files['owner/index.html'] = fs.readFileSync(path.join(KIT, 'static/owner/index.html'), 'utf8').replaceAll('{{NAME}}', esc(cfg.business.name));
  files['owner/owner.js'] = fs.readFileSync(path.join(KIT, 'static/owner/owner.js'), 'utf8');
  files['demo/demo.css'] = fs.readFileSync(path.join(KIT, 'static/demo/demo.css'), 'utf8');
  files['demo/demo.js'] = fs.readFileSync(path.join(KIT, 'static/demo/demo.js'), 'utf8');
  for (const kind of ['owner', 'client']) {
    files[`demo/${kind}/index.html`] = fs.readFileSync(path.join(KIT, 'static/demo/page.html'), 'utf8')
      .replaceAll('{{NAME}}', esc(cfg.business.name)).replaceAll('{{KIND}}', kind)
      .replaceAll('{{TITLE}}', kind === 'owner' ? 'Owner demo' : 'Client demo')
      .replaceAll('{{OTHER}}', kind === 'owner' ? 'client' : 'owner');
  }
  return files;
}

export function writeDist(files, outDir, assetsCopied = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(outDir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body);
  }
  for (const [name, buf] of Object.entries(assetsCopied)) {
    const p = path.join(outDir, 'assets', name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf);
  }
}
