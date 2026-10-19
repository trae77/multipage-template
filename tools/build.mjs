#!/usr/bin/env node
// Static site builder. Writes every public page plus the portal/admin shells to an output folder.
//   node tools/build.mjs                       -> dist/        (server mode: portal talks to /api)
//   node tools/build.mjs --demo                -> dist-demo/   (browser-only, localStorage mock data)
// Options: --config site.config.json --trade roofing --theme premium-dark --out dir --site-url https://...
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
import { md, esc } from '../src/md.mjs';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DEMO = args.includes('--demo');
const readJson = (p) => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));
const cfg = readJson(opt('config', 'site.config.json'));
const TRADES = readJson('presets/trades.json');
const THEMES = readJson('presets/themes.json');
const content = readJson(opt('content', 'content/sample.json'));
const tradeKey = opt('trade', cfg.trade || 'generic-business');
const trade = TRADES[tradeKey];
if (!trade) { console.error(`Unknown trade "${tradeKey}". Options: ${Object.keys(TRADES).join(', ')}`); process.exit(1); }
const themeKey = opt('theme', cfg.theme || trade.theme);
if (!THEMES[themeKey]) { console.error(`Unknown theme "${themeKey}". Options: ${Object.keys(THEMES).join(', ')}`); process.exit(1); }
const OUT = path.resolve(ROOT, opt('out', DEMO ? 'dist-demo' : 'dist'));
const siteUrl = (opt('site-url', cfg.siteUrl) || '').replace(/\/$/, '');
const B = cfg.business; const F = cfg.features || {};
const primary = cfg.colors?.primary || trade.colors?.primary || '#1e3a8a';
const accent = cfg.colors?.accent || trade.colors?.accent || '#f59e0b';
const dark = THEMES[themeKey].dark;
const services = (cfg.services?.length ? cfg.services : trade.services).map((s) => ({ ...s, slug: s.slug || s.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));

// ---- color helpers (WCAG contrast) ----
const rgb = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
const hex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), Bc = rgb(b); return hex(A.map((v, i) => v + (Bc[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const onColor = (bg) => (contrast(bg, '#ffffff') >= contrast(bg, '#0f172a') ? '#ffffff' : '#0f172a');
const readable = (fg, bg) => { let c = fg; for (let i = 0; i < 20 && contrast(c, bg) < 4.5; i++) c = mix(c, lum(bg) > 0.5 ? '#000000' : '#ffffff', 0.15); return c; };
const pageBg = dark ? '#0b0f17' : '#ffffff';
const vars = `:root{--brand-primary:${primary};--brand-accent:${accent};--accent:${readable(accent, pageBg)};--on-accent:${onColor(accent)};--on-primary:${onColor(primary)};--link:${readable(primary, dark ? '#131a26' : '#f8fafc')};--hero-tint:${mix(primary, '#ffffff', 0.9)};--hero-deep:${mix(primary, '#000000', 0.45)};--border-strong:${dark ? 'rgba(255,255,255,.25)' : 'rgba(15,23,42,.3)'};--focus:${dark ? '#93c5fd' : '#1d4ed8'}}`;
// Theme CSS assumes one-pager markup; header text color needs to stay readable with our header.
const css = fs.readFileSync(path.join(ROOT, 'src/public/base.css'), 'utf8') + '\n' + vars + `\n/* Theme: ${themeKey} (from client-site-templates tools/library.mjs) */\n` + THEMES[themeKey].css
  + `\n@media (max-width:1100px){.site-header .nav a:not(.nav-cta){color:inherit}}` + (themeKey === 'bold-industrial' ? `\n@media (max-width:1100px){.nav{background:#111827}}` : '');

// ---- pages ----
const NAV = [['', 'Home'], ['services/', 'Services'], F.gallery !== false && ['projects/', 'Projects'], F.reviews !== false && ['reviews/', 'Reviews'], F.serviceArea !== false && ['service-area/', 'Service Area'], F.faq !== false && ['faq/', 'FAQ'], F.blog !== false && ['blog/', 'Blog'], ['about/', 'About'], F.booking !== false && ['book/', 'Book'], (F.portal !== false || F.admin !== false) && ['login/', 'Log in'], ['contact/', 'Get a Quote', true]].filter(Boolean);
const tel = 'tel:' + (B.phone || '').replace(/[^\d+]/g, '');
const sitemap = [];
const sampleTag = (it) => (it?.sample ? '<span class="sample-tag">Sample</span><br>' : '');
const tile = (label, cls = '') => `<div class="ph-tile ${cls}" role="img" aria-label="${esc(label)}"><span>${esc(label)}</span></div>`;
const img = (src, alt, fallback, cls) => (src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" width="800" height="600">` : tile(fallback, cls));
const baSlider = (p) => `<div class="ba" style="--split:50%"><div class="ba-layer">${img(p.before, `Before: ${p.title}`, 'Sample before photo')}</div><div class="ba-layer ba-after">${img(p.after, `After: ${p.title}`, 'Sample after photo', 'after')}</div><span class="ba-line" aria-hidden="true"></span><label class="sr-only" for="ba-${p.id}">Before and after comparison for ${esc(p.title)}</label><input id="ba-${p.id}" type="range" min="0" max="100" value="50" data-ba></div>`;
const projectCard = (p) => `<article class="card">${F.beforeAfter !== false ? baSlider(p) : img(p.after, p.title, 'Sample project photo')}<h3 style="margin-top:1rem">${sampleTag(p)}${esc(p.title)}</h3><p>${esc(p.city || '')}</p><p>${esc(p.summary || '')}</p></article>`;
const reviewCard = (r) => `<figure class="card review">${sampleTag(r)}<blockquote>“${esc(r.text)}”</blockquote><figcaption>${esc(r.author)}</figcaption></figure>`;
const postCard = (p, pre) => `<article class="card">${sampleTag(p)}<h3><a href="${pre}blog/${esc(p.slug)}/">${esc(p.title)}</a></h3><p><time datetime="${esc(p.date)}">${esc(p.date)}</time></p><p>${esc(p.excerpt || '')}</p></article>`;
const head = (t, d) => `<div class="section-head"><h2>${esc(t)}</h2>${d ? `<p>${esc(d)}</p>` : ''}</div>`;
const jsonLd = () => JSON.stringify({ '@context': 'https://schema.org', '@type': 'LocalBusiness', name: B.name, telephone: B.phone, email: B.email, url: siteUrl || undefined,
  address: { '@type': 'PostalAddress', streetAddress: (B.address || '').split(',')[0], addressLocality: B.city, addressRegion: B.region, postalCode: B.postalCode },
  areaServed: (B.serviceAreas || []).map((n) => ({ '@type': 'City', name: n })), ...(B.hours ? { openingHours: B.hours } : {}),
  makesOffer: services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name } })) }).replace(/</g, '\\u003c');
const analytics = () => { const a = cfg.analytics || {}; if (DEMO || !a.id) return '';
  if (a.provider === 'plausible') return `<script defer data-domain="${esc(a.id)}" src="https://plausible.io/js/script.js"></script>`;
  if (a.provider === 'ga4') return `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(a.id)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(a.id)});</script>`;
  return ''; };

function page(rel, { title, description, page: pageId = '', body, noindex = false }) {
  const depth = rel ? rel.split('/').filter(Boolean).length : 0; const pre = '../'.repeat(depth) || './';
  const fullTitle = rel ? `${title} | ${B.name}` : `${B.name}${B.tagline ? ' | ' + B.tagline : ''}`;
  const canon = siteUrl ? `${siteUrl}/${rel}` : '';
  if (!noindex) sitemap.push(rel);
  const nav = NAV.map(([href, label, cta]) => `<a href="${pre}${href}"${href === rel ? ' aria-current="page"' : ''}${cta ? ' class="nav-cta"' : ''}>${label}</a>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${canon ? `<link rel="canonical" href="${esc(canon)}">` : ''}${noindex || DEMO ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website">${canon ? `<meta property="og:url" content="${esc(canon)}">` : ''}
<meta name="theme-color" content="${primary}">
<link rel="stylesheet" href="${pre}assets/site.css">
<script type="application/ld+json">${jsonLd()}</script>
${analytics()}
</head>
<body class="${dark ? 'theme-dark ' : ''}${F.callBar !== false ? 'has-call-bar' : ''}" data-page="${pageId}" data-root="${pre}">
<a class="skip-link" href="#main">Skip to content</a>
${DEMO ? '<div class="demo-banner" role="note">Demo mode, sample data. Nothing here is a real business, customer or review.</div>' : ''}
<header class="site-header"><div class="wrap"><a class="logo" href="${pre}">${esc(B.name)}</a>
<button class="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><span></span><span></span><span></span></button>
<nav id="site-nav" class="nav" aria-label="Main">${nav}</nav></div></header>
<main id="main">
${body(pre)}
</main>
<footer class="site-footer"><div class="wrap grid">
<div><strong>${esc(B.name)}</strong><br>${esc(B.address || '')}<br><a href="${tel}">${esc(B.phone)}</a><br><a href="mailto:${esc(B.email)}">${esc(B.email)}</a></div>
<div><strong>Services</strong><br>${services.map((s) => `<a href="${pre}services/${s.slug}/">${esc(s.name)}</a>`).join('<br>')}</div>
<div><strong>Links</strong><br>${NAV.map(([h, l]) => `<a href="${pre}${h}">${l}</a>`).join('<br>')}</div>
</div></footer>
${F.callBar !== false ? `<div class="call-bar" aria-label="Quick contact"><a class="cb-call" href="${tel}">Call</a><a class="cb-alt" href="${pre}contact/">Get a Quote</a>${F.booking !== false ? `<a class="cb-alt" href="${pre}book/">Book</a>` : ''}</div>` : ''}
<script>window.SITE=${JSON.stringify({ mode: DEMO ? 'demo' : 'api', name: B.name, phone: B.phone, email: B.email, booking: cfg.booking, payLink: /^https:\/\/(buy|checkout)\.stripe\.com\//.test(cfg.payments?.stripePaymentLink || '') ? cfg.payments.stripePaymentLink : '', features: F, services: services.map((s) => s.name) }).replace(/</g, '\\u003c')};</script>
${DEMO ? `<script>window.SEED=${JSON.stringify(content).replace(/</g, '\\u003c')};</script>` : ''}
<script type="module" src="${pre}assets/app.js"></script>
</body></html>`;
  const file = path.join(OUT, rel, 'index.html'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, html);
}

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets/site.css'), css);
for (const f of ['app.js', 'md.js', 'slots.js']) fs.copyFileSync(path.join(ROOT, 'src/public', f), path.join(OUT, 'assets', f));
if (DEMO) fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
const label = trade.label;
const cityLine = B.city ? ` in ${B.city}${B.region ? ', ' + B.region : ''}` : '';

page('', { title: 'Home', page: 'home', description: `${B.name}: ${label}${cityLine}. Request a quote, book a visit, or log in to see your project.`, body: (pre) => `
<section class="hero"><div class="wrap"><span class="hero-badge">${esc(label)}${esc(cityLine)}</span>
<h1 data-content="headline">${esc(B.tagline || B.name)}</h1><p data-content="intro">${esc(`${B.name} offers ${services.map((s) => s.name.toLowerCase()).join(', ')}${cityLine}.`)}</p>
<div class="btn-row"><a class="btn" href="${pre}contact/">Get a Quote</a><a class="btn btn-ghost" href="${tel}">Call ${esc(B.phone)}</a>${F.booking !== false ? `<a class="btn btn-ghost" href="${pre}book/">Book a visit</a>` : ''}</div></div></section>
<section><div class="wrap">${head('Services', 'What we do.')}<div class="grid">${services.map((s) => `<article class="card"><h3>${esc(s.name)}</h3><p>${esc(s.summary)}</p><a class="more" href="${pre}services/${s.slug}/">Learn about ${esc(s.name)}</a></article>`).join('')}</div></div></section>
${F.gallery !== false ? `<section><div class="wrap">${head('Recent projects', 'Drag the slider to compare before and after.')}<div class="grid" data-list="projects" data-limit="3">${content.projects.slice(0, 3).map(projectCard).join('')}</div><p><a class="btn btn-secondary" href="${pre}projects/">See all projects</a></p></div></section>` : ''}
${F.reviews !== false && content.reviews.length ? `<section><div class="wrap">${head('Reviews')}<div class="grid">${content.reviews.slice(0, 3).map(reviewCard).join('')}</div></div></section>` : ''}
<section><div class="wrap">${head('Ready to start?', 'Tell us about the job and we will get back to you.')}<div class="btn-row"><a class="btn" href="${pre}contact/">Request a quote</a>${F.portal !== false ? `<a class="btn btn-secondary" href="${pre}login/">Customer login</a>` : ''}</div></div></section>` });

page('services/', { title: 'Services', page: 'services', description: `${label} services from ${B.name}: ${services.map((s) => s.name).join(', ')}.`, body: (pre) => `
<section class="page-hero"><div class="wrap"><h1>Services</h1><p>${esc(B.name)} services${esc(cityLine)}.</p></div></section>
<section><div class="wrap grid">${services.map((s) => `<article class="card"><h2 style="font-size:1.3rem;margin-top:0">${esc(s.name)}</h2><p>${esc(s.summary)}</p><a class="more" href="${pre}services/${s.slug}/">Details</a></article>`).join('')}</div></section>` });
for (const s of services) page(`services/${s.slug}/`, { title: s.name, page: 'service', description: `${s.name} from ${B.name}${cityLine}. ${s.summary}`, body: (pre) => `
<section class="page-hero"><div class="wrap"><p><a href="${pre}services/">Services</a> / ${esc(s.name)}</p><h1>${esc(s.name)}</h1><p>${esc(s.summary)}</p></div></section>
<section><div class="wrap prose">${s.body ? md(s.body) : `<p><span class="sample-tag">Sample</span> Detail copy for ${esc(s.name)} goes here. Add a "body" field to this service in site.config.json with the owner's own description.</p>`}
<div class="btn-row"><a class="btn" href="${pre}contact/?service=${encodeURIComponent(s.name)}">Request a ${esc(s.name)} quote</a>${F.booking !== false ? `<a class="btn btn-secondary" href="${pre}book/?service=${encodeURIComponent(s.name)}">Book a visit</a>` : ''}</div></div></section>` });

page('about/', { title: 'About', page: 'about', description: `About ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>About ${esc(B.name)}</h1></div></section><section><div class="wrap prose" data-content="about">${md(B.about)}</div></section>` });
if (F.gallery !== false) page('projects/', { title: 'Projects', page: 'projects', description: `Project gallery from ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Projects</h1><p>Before and after photos from recent jobs.</p></div></section><section><div class="wrap grid" data-list="projects">${content.projects.map(projectCard).join('')}</div></section>` });
if (F.reviews !== false) page('reviews/', { title: 'Reviews', page: 'reviews', description: `Customer reviews for ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Reviews</h1><p>Reviews are shown only from data the owner enters from real customers.</p></div></section><section><div class="wrap grid">${content.reviews.length ? content.reviews.map(reviewCard).join('') : '<p>No reviews yet.</p>'}</div></section>` });
if (F.serviceArea !== false) page('service-area/', { title: 'Service Area', page: 'area', description: `${B.name} serves ${(B.serviceAreas || []).join(', ')}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Service area</h1></div></section><section><div class="wrap"><ul class="areas">${(B.serviceAreas || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>${B.mapQuery ? `<iframe class="map-frame" title="Map of ${esc(B.mapQuery)}" loading="lazy" src="https://maps.google.com/maps?q=${encodeURIComponent(B.mapQuery)}&z=10&output=embed"></iframe>` : ''}</div></section>` });
if (F.faq !== false) page('faq/', { title: 'FAQ', page: 'faq', description: `Frequently asked questions for ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>FAQ</h1></div></section><section><div class="wrap faq prose">${content.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></section>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: content.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }).replace(/</g, '\\u003c')}</script>` });
if (F.blog !== false) {
  page('blog/', { title: 'Blog', page: 'blog', description: `News and tips from ${B.name}.`, body: (pre) => `<section class="page-hero"><div class="wrap"><h1>Blog &amp; news</h1></div></section><section><div class="wrap grid" data-list="posts">${content.posts.map((p) => postCard(p, pre)).join('')}</div></section>` });
  for (const p of content.posts) page(`blog/${p.slug}/`, { title: p.title, page: 'post', description: p.excerpt || p.title, body: (pre) => `<section class="page-hero"><div class="wrap"><p><a href="${pre}blog/">Blog</a></p>${sampleTag(p)}<h1>${esc(p.title)}</h1><p><time datetime="${esc(p.date)}">${esc(p.date)}</time></p></div></section><section><article class="wrap prose">${md(p.body)}</article></section>` });
  page('blog/post/', { title: 'Post', page: 'post-dynamic', noindex: true, description: 'Blog post', body: () => `<section class="page-hero"><div class="wrap"><h1 id="post-title">Loading…</h1><p id="post-date"></p></div></section><section><article class="wrap prose" id="post-body"></article></section>` });
}
const formStatus = '<p class="status" role="status" aria-live="polite"></p>';
page('contact/', { title: 'Contact & Quote', page: 'contact', description: `Request a quote from ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Request a quote</h1><p>Call <a href="${tel}">${esc(B.phone)}</a> or send the form. Fields marked * are required.</p></div></section>
<section><div class="wrap grid"><form class="form card" id="lead-form" novalidate>
<label for="lf-name">Name *</label><input id="lf-name" name="name" autocomplete="name" required>
<label for="lf-phone">Phone *</label><input id="lf-phone" name="phone" type="tel" autocomplete="tel" required>
<label for="lf-email">Email</label><input id="lf-email" name="email" type="email" autocomplete="email">
<label for="lf-service">Service</label><select id="lf-service" name="service"><option value="">Choose one</option>${services.map((s) => `<option>${esc(s.name)}</option>`).join('')}<option>Other</option></select>
<label for="lf-address">Job address or city</label><input id="lf-address" name="address" autocomplete="street-address">
<label for="lf-msg">Tell us about the job *</label><textarea id="lf-msg" name="message" required></textarea>
<button class="btn" type="submit">Send request</button>${formStatus}</form>
<div class="card"><h2 style="margin-top:0;font-size:1.3rem">Contact</h2><p><a href="${tel}">${esc(B.phone)}</a><br><a href="mailto:${esc(B.email)}">${esc(B.email)}</a><br>${esc(B.address || '')}</p>${B.hours ? `<p><strong>Hours:</strong> ${esc(B.hours)}</p>` : ''}</div></div></section>` });
if (F.booking !== false) page('book/', { title: 'Book a visit', page: 'book', description: `Book a visit with ${B.name} online.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Book a visit</h1><p>Pick a day and an open time. The owner confirms each booking.</p></div></section>
<section><div class="wrap"><form class="form card" id="book-form" novalidate>
<label for="bk-date">Day *</label><input id="bk-date" name="date" type="date" required>
<fieldset style="border:0;padding:0;margin:.9rem 0 0"><legend style="font-weight:600">Open times *</legend><div class="slots" id="bk-slots"><p class="hint">Choose a day first.</p></div></fieldset>
<label for="bk-service">Service</label><select id="bk-service" name="service">${services.map((s) => `<option>${esc(s.name)}</option>`).join('')}</select>
<label for="bk-name">Name *</label><input id="bk-name" name="name" autocomplete="name" required>
<label for="bk-phone">Phone *</label><input id="bk-phone" name="phone" type="tel" autocomplete="tel" required>
<label for="bk-email">Email</label><input id="bk-email" name="email" type="email" autocomplete="email">
<label for="bk-notes">Notes</label><textarea id="bk-notes" name="notes"></textarea>
<button class="btn" type="submit">Request this time</button>${formStatus}</form></div></section>` });
page('login/', { title: 'Log in', page: 'login', noindex: true, description: `Customer and owner login for ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Log in</h1><p>Customers can see quotes, invoices, project status, photos and messages.</p></div></section>
<section><div class="wrap grid"><form class="form card" id="login-form" novalidate><label for="li-email">Email</label><input id="li-email" name="email" type="email" autocomplete="username" required><label for="li-pass">Password</label><input id="li-pass" name="password" type="password" autocomplete="current-password" required><button class="btn" type="submit">Log in</button>${formStatus}</form>
${DEMO ? `<div class="demo-logins" aria-label="Demo logins"><h2 style="margin-top:0;font-size:1.2rem">Demo logins (sample data)</h2><p><strong>Owner:</strong> <code>owner@demo.test</code> / <code>demo-owner</code></p><p><strong>Customer:</strong> <code>customer@demo.test</code> / <code>demo-customer</code></p><p class="hint" style="color:#44403c">Data is stored in this browser only. Use “Reset demo data” in the dashboard to start over.</p></div>` : ''}</div></section>` });
page('portal/', { title: 'Customer portal', page: 'portal', noindex: true, description: 'Customer portal', body: () => `<section class="page-hero"><div class="wrap"><h1>My account</h1><p id="who"></p></div></section><section><div class="wrap" id="app" aria-live="polite"></div></section>` });
page('admin/', { title: 'Owner dashboard', page: 'admin', noindex: true, description: 'Owner dashboard', body: () => `<section class="page-hero"><div class="wrap"><h1>Owner dashboard</h1><p id="who"></p></div></section><section><div class="wrap" id="app" aria-live="polite"></div></section>` });

fs.writeFileSync(path.join(OUT, 'robots.txt'), DEMO ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nDisallow: /login/\nDisallow: /portal/\nDisallow: /admin/\nDisallow: /api/\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((r) => `  <url><loc>${esc(`${siteUrl}/${r}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'build.json'), JSON.stringify({ mode: DEMO ? 'demo' : 'api', trade: tradeKey, theme: themeKey, pages: sitemap.length }, null, 2));
console.log(`Built ${DEMO ? 'demo' : 'server'} site → ${path.relative(ROOT, OUT)} (trade ${tradeKey}, theme ${themeKey}, ${sitemap.length} indexed pages)`);
