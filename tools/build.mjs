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
// Blog posts: content/blog/*.md with a small front-matter block (title, date, excerpt, sample).
const BLOG_DIR = path.resolve(ROOT, opt('blog', 'content/blog'));
content.posts = (fs.existsSync(BLOG_DIR) ? fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md')) : []).map((f) => {
  const raw = fs.readFileSync(path.join(BLOG_DIR, f), 'utf8'); const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); const meta = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { slug: f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''), title: meta.title || f, date: meta.date || '', excerpt: meta.excerpt || '', author: meta.author || '', sample: meta.sample === 'true', body: m ? m[2] : raw };
}).sort((a, b) => String(b.date).localeCompare(a.date));
const IND = readJson('presets/industries.json');
const trade = TRADES[tradeKey];
if (!trade) { console.error(`Unknown trade "${tradeKey}". Options: ${Object.keys(TRADES).join(', ')}`); process.exit(1); }
const themeKey = opt('theme', cfg.theme || trade.theme);
if (!THEMES[themeKey]) { console.error(`Unknown theme "${themeKey}". Options: ${Object.keys(THEMES).join(', ')}`); process.exit(1); }
const OUT = path.resolve(ROOT, opt('out', DEMO ? 'dist-demo' : 'dist'));
const siteUrl = (opt('site-url', cfg.siteUrl) || '').replace(/\/$/, '');
const B = cfg.business; const F = { ...(cfg.features || {}) };
const ACTION = opt('action', cfg.actionPage) || ['book', 'order', 'schedule', 'listings', 'packages'].find((k) => IND[k].includes(tradeKey)) || 'quote';
const ACTION_LABEL = cfg.actionLabel || IND.labels[ACTION];
// Medical: no portal on this stack (no HIPAA BAA). Link to the practice's own patient portal instead.
const MEDICAL = IND.portalOff.includes(tradeKey); if (MEDICAL) F.portal = false;
const SQUARE = /^https:\/\//.test(cfg.ordering?.squareUrl || '') ? cfg.ordering.squareUrl : '';
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
  + (themeKey === 'bold-industrial' ? '\n.site-header{color:#f8fafc}.site-header .hdr-login,.site-header .hdr-phone{color:#f8fafc}.menu-btn{border-color:rgba(255,255,255,.5)}' : '');

// ---- pages ----
const TOP = [ACTION === 'order' && ['menu/', 'Menu'], ['services/', 'Services'], F.gallery !== false && ['gallery/', 'Gallery'], F.reviews !== false && ['reviews/', 'Reviews'], ['about/', 'About'], F.blog !== false && ['blog/', 'Blog'], ['contact/', 'Contact']].filter(Boolean).slice(0, 6);
const MORE = [F.faq !== false && ['faq/', 'FAQ'], F.serviceArea !== false && ['service-area/', 'Service Area'], F.booking !== false && ACTION !== 'book' && ['book/', 'Book a visit'], ACTION === 'schedule' && ['schedule/', 'Schedule'], ACTION === 'listings' && ['listings/', 'Listings'], ACTION === 'packages' && ['packages/', 'Packages'], ACTION === 'order' && ['order/', 'Order pickup'], ACTION === 'quote' && ['quote/', 'Quote builder'], MEDICAL && B.patientPortalUrl && [B.patientPortalUrl, 'Patient portal']].filter(Boolean);
const NAV = [['', 'Home'], ...TOP, ...MORE, ...((F.portal !== false || F.admin !== false) ? [['login/', 'Log in']] : [])];
const hrefOf = (pre, h) => (/^https?:/.test(h) ? h : pre + h);
const tel = 'tel:' + (B.phone || '').replace(/[^\d+]/g, ''); const sms = 'sms:' + (B.textPhone || B.phone || '').replace(/[^\d+]/g, '');
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
  const link = ([href, label]) => `<a href="${hrefOf(pre, href)}"${href === rel ? ' aria-current="page"' : ''}>${label}</a>`;
  const cta = `${pre}${ACTION}/`; const login = F.portal !== false || F.admin !== false;
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
<nav class="nav-desktop" aria-label="Main">${TOP.map(link).join('')}</nav>
<div class="hdr-actions"><a class="hdr-phone" href="${tel}">${esc(B.phone)}</a>${login ? `<a class="hdr-login" href="${pre}login/">Log in</a>` : ''}<a class="btn hdr-cta" href="${cta}">${esc(ACTION_LABEL)}</a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu-sheet"><span class="menu-icon" aria-hidden="true"></span>Menu</button></div></div></header>
<div id="menu-sheet" class="menu-sheet" role="dialog" aria-modal="true" aria-label="Site menu" hidden><div class="menu-sheet-inner">
<button class="menu-close" type="button">Close <span aria-hidden="true">×</span></button>
<a class="btn menu-cta" href="${cta}">${esc(ACTION_LABEL)}</a>
<nav aria-label="Menu links">${NAV.map(link).join('')}</nav>
<p class="menu-contact"><a href="${tel}">Call ${esc(B.phone)}</a><br><a href="${sms}">Text us</a>${B.hours ? `<br>${esc(B.hours)}` : ''}</p></div></div>
<main id="main">
${body(pre)}
</main>
<footer class="site-footer"><div class="wrap grid">
<div><strong>${esc(B.name)}</strong><br>${esc(B.address || '')}<br><a href="${tel}">${esc(B.phone)}</a><br><a href="mailto:${esc(B.email)}">${esc(B.email)}</a></div>
<div><strong>Services</strong><br>${services.map((s) => `<a href="${pre}services/${s.slug}/">${esc(s.name)}</a>`).join('<br>')}</div>
<div><strong>Links</strong><br>${NAV.map(([h, l]) => `<a href="${hrefOf(pre, h)}">${l}</a>`).join('<br>')}</div>
<div><strong>Service areas</strong><br>${(B.serviceAreas || []).map(esc).join('<br>')}${B.hours ? `<br><br><strong>Hours</strong><br>${esc(B.hours)}` : ''}${B.license ? `<br><br>${esc(B.license)}` : ''}</div>
</div></footer>
${F.callBar !== false ? `<nav class="call-bar" aria-label="Quick actions"><a class="cb-alt" href="${tel}">Call</a><a class="cb-alt" href="${sms}">Text</a><a class="cb-call" href="${cta}">${esc(ACTION_LABEL)}</a></nav>` : ''}
<script>window.SITE=${JSON.stringify({ mode: DEMO ? 'demo' : 'api', name: B.name, phone: B.phone, email: B.email, booking: cfg.booking, payLink: /^https:\/\/(buy|checkout)\.stripe\.com\//.test(cfg.payments?.stripePaymentLink || '') ? cfg.payments.stripePaymentLink : '', features: F, trade: tradeKey, action: ACTION, ordering: { squareUrl: /^https:\/\//.test(cfg.ordering?.squareUrl || '') ? cfg.ordering.squareUrl : '' }, services: services.map((s) => s.name) }).replace(/</g, '\\u003c')};</script>
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
<div class="btn-row"><a class="btn" href="${pre}${ACTION}/">${esc(ACTION_LABEL)}</a><a class="btn btn-ghost" href="${tel}">Call ${esc(B.phone)}</a>${F.booking !== false ? `<a class="btn btn-ghost" href="${pre}book/">Book a visit</a>` : ''}</div></div></section>
<section><div class="wrap">${head('Services', 'What we do.')}<div class="grid">${services.map((s) => `<article class="card"><h3>${esc(s.name)}</h3><p>${esc(s.summary)}</p><a class="more" href="${pre}services/${s.slug}/">Learn about ${esc(s.name)}</a></article>`).join('')}</div></div></section>
${F.gallery !== false ? `<section><div class="wrap">${head('Recent projects', 'Drag the slider to compare before and after.')}<div class="grid" data-list="projects" data-limit="3">${content.projects.slice(0, 3).map(projectCard).join('')}</div><p><a class="btn btn-secondary" href="${pre}gallery/">See the gallery</a></p></div></section>` : ''}
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
if (F.gallery !== false) {
  const cats = [...new Set(content.projects.map((p) => p.category).filter(Boolean))];
  page('gallery/', { title: 'Gallery', page: 'gallery', description: `Project gallery from ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Gallery</h1><p>Before and after photos from recent jobs. Select a photo to enlarge it.</p></div></section><section><div class="wrap">
${cats.length > 1 ? `<div class="chips" role="group" aria-label="Filter by category"><button type="button" class="chip" aria-pressed="true" data-cat="">All</button>${cats.map((c) => `<button type="button" class="chip" aria-pressed="false" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
<div class="grid" data-list="projects" data-gallery>${content.projects.map((p) => projectCard(p).replace('<article class="card"', `<article class="card" data-cat="${esc(p.category || '')}"`)).join('')}</div></div></section>
<dialog class="lightbox" id="lightbox" aria-label="Enlarged photo"><button type="button" class="menu-close" data-close>Close <span aria-hidden="true">×</span></button><div class="lightbox-body"></div><div class="btn-row"><button type="button" class="btn btn-ghost" data-prev>Previous</button><button type="button" class="btn btn-ghost" data-next>Next</button></div></dialog>` });
  page('projects/', { title: 'Gallery', page: 'redirect', noindex: true, description: 'Moved to the gallery', body: (pre) => `<section class="page-hero"><div class="wrap"><h1>This page moved</h1><p><a href="${pre}gallery/">Go to the gallery</a></p></div></section><script>location.replace(${JSON.stringify('../gallery/')})</script>` });
}
if (F.reviews !== false) page('reviews/', { title: 'Reviews', page: 'reviews', description: `Customer reviews for ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Reviews</h1><p>Reviews are shown only from data the owner enters from real customers.</p></div></section><section><div class="wrap grid">${content.reviews.length ? content.reviews.map(reviewCard).join('') : '<p>No reviews yet.</p>'}</div></section>` });
if (F.serviceArea !== false) page('service-area/', { title: 'Service Area', page: 'area', description: `${B.name} serves ${(B.serviceAreas || []).join(', ')}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Service area</h1></div></section><section><div class="wrap"><ul class="areas">${(B.serviceAreas || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>${B.mapQuery ? `<iframe class="map-frame" title="Map of ${esc(B.mapQuery)}" loading="lazy" src="https://maps.google.com/maps?q=${encodeURIComponent(B.mapQuery)}&z=10&output=embed"></iframe>` : ''}</div></section>` });
if (F.faq !== false) page('faq/', { title: 'FAQ', page: 'faq', description: `Frequently asked questions for ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>FAQ</h1></div></section><section><div class="wrap faq prose">${content.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></section>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: content.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }).replace(/</g, '\\u003c')}</script>` });
const ctaBox = (pre) => `<aside class="cta-box" aria-label="${esc(ACTION_LABEL)}"><h2>Ready when you are</h2><p>Call <a href="${tel}">${esc(B.phone)}</a> or use the button below.</p><a class="btn" href="${pre}${ACTION}/">${esc(ACTION_LABEL)}</a></aside>`;
if (F.blog !== false) {
  const PER = 9; const pages = Math.max(1, Math.ceil(content.posts.length / PER));
  for (let n = 1; n <= pages; n++) {
    const list = content.posts.slice((n - 1) * PER, n * PER); const rel = n === 1 ? 'blog/' : `blog/page/${n}/`;
    page(rel, { title: n === 1 ? 'Blog' : `Blog, page ${n}`, page: 'blog', description: `News and tips from ${B.name}.`, body: (pre) => `<section class="page-hero"><div class="wrap"><h1>Blog &amp; news</h1></div></section><section><div class="wrap">
${n === 1 && list[0] ? `<article class="card featured">${sampleTag(list[0])}<p class="hint">Latest post</p><h2><a href="${pre}blog/${esc(list[0].slug)}/">${esc(list[0].title)}</a></h2><p><time datetime="${esc(list[0].date)}">${esc(list[0].date)}</time></p><p>${esc(list[0].excerpt)}</p></article>` : ''}
<div class="grid" data-list="posts">${(n === 1 ? list.slice(1) : list).map((p) => postCard(p, pre)).join('')}</div>
${pages > 1 ? `<nav class="pager" aria-label="Blog pages">${Array.from({ length: pages }, (_, k) => `<a href="${pre}${k === 0 ? 'blog/' : `blog/page/${k + 1}/`}"${k + 1 === n ? ' aria-current="page"' : ''}>${k + 1}</a>`).join('')}</nav>` : ''}</div></section>` });
  }
  for (const p of content.posts) page(`blog/${p.slug}/`, { title: p.title, page: 'post', description: p.excerpt || p.title, body: (pre) => {
    const html = md(p.body); const parts = html.split('\n'); const mid = Math.min(2, parts.length);
    return `<section class="page-hero"><div class="wrap"><p><a href="${pre}blog/">Blog</a></p>${sampleTag(p)}<h1>${esc(p.title)}</h1><p><time datetime="${esc(p.date)}">${esc(p.date)}</time>${p.author ? ` · ${esc(p.author)}` : ''}</p></div></section>
<section><article class="wrap prose">${parts.slice(0, mid).join('\n')}${parts.length > mid ? ctaBox(pre) + parts.slice(mid).join('\n') : ''}${ctaBox(pre)}
<p><strong>Related services:</strong> ${services.slice(0, 3).map((s) => `<a href="${pre}services/${s.slug}/">${esc(s.name)}</a>`).join(' · ')}</p></article></section>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, datePublished: p.date, author: { '@type': p.author ? 'Person' : 'Organization', name: p.author || B.name }, publisher: { '@type': 'Organization', name: B.name } }).replace(/</g, '\\u003c')}</script>`; } });
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
<section><div class="wrap">${/^https:\/\//.test(cfg.booking?.embedUrl || '') ? `<iframe class="book-embed" title="Online booking" src="${esc(cfg.booking.embedUrl)}" loading="lazy"></iframe>` : `<ol class="stepper" aria-label="Booking steps"><li>Service</li><li>Day and time</li><li>Your details</li><li>Confirmation</li></ol><form class="form card" id="book-form" novalidate>
<label for="bk-service">Service</label><select id="bk-service" name="service">${services.map((s) => `<option>${esc(s.name)}</option>`).join('')}</select>
<label for="bk-date">Day *</label><input id="bk-date" name="date" type="date" required>
<fieldset style="border:0;padding:0;margin:.9rem 0 0"><legend style="font-weight:600">Open times *</legend><div class="slots" id="bk-slots"><p class="hint">Choose a day first.</p></div></fieldset>
<label for="bk-name">Name *</label><input id="bk-name" name="name" autocomplete="name" required>
<label for="bk-phone">Phone *</label><input id="bk-phone" name="phone" type="tel" autocomplete="tel" required>
<label for="bk-email">Email</label><input id="bk-email" name="email" type="email" autocomplete="email">
<label for="bk-notes">Notes</label><textarea id="bk-notes" name="notes"></textarea>
<button class="btn" type="submit">Request this time</button>${formStatus}</form>`}</div></section>` });
// ---- main-action (money) pages, spec v2 P1 ----
const opts = (o) => o.map((x) => `<option>${esc(x)}</option>`).join('');
if (ACTION === 'quote' || F.quoteBuilder) page('quote/', { title: 'Quote builder', page: 'quote', description: `Build a quote request for ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Build your quote request</h1><p>Answer a few questions. ${cfg.pricing ? '' : 'We will send your price after we review the details.'}</p></div></section>
<section><div class="wrap money-grid"><form class="form card" id="quote-form" novalidate>
<fieldset><legend><span class="step-n">1</span> Service</legend>${services.map((s, i) => `<label class="opt"><input type="radio" name="service" value="${esc(s.name)}"${i === 0 ? ' checked' : ''}> ${esc(s.name)}</label>`).join('')}<label class="opt"><input type="radio" name="service" value="Other"> Other / not sure</label></fieldset>
<fieldset><legend><span class="step-n">2</span> Size of the job</legend><label for="qf-size">Approximate size or quantity (for example square feet, rooms or items)</label><input id="qf-size" name="size" inputmode="decimal"><label for="qf-cond">Condition</label><select id="qf-cond" name="condition">${opts(['Not sure', 'Good, routine work', 'Some damage or wear', 'Major damage'])}</select></fieldset>
<fieldset><legend><span class="step-n">3</span> Timing</legend><label for="qf-when">When do you need it?</label><select id="qf-when" name="when">${opts(['Flexible', 'Within 2 weeks', 'Within a month', 'Urgent'])}</select></fieldset>
<fieldset><legend><span class="step-n">4</span> Photos</legend><p class="hint">Photos help us price the job. Text them to us after you send this form.</p><a class="btn btn-ghost" href="${sms}">Text us photos</a></fieldset>
<fieldset><legend><span class="step-n">5</span> Contact</legend><label for="qf-name">Name *</label><input id="qf-name" name="name" autocomplete="name" required><label for="qf-phone">Phone *</label><input id="qf-phone" name="phone" type="tel" autocomplete="tel" required><label for="qf-email">Email</label><input id="qf-email" name="email" type="email" autocomplete="email"><label for="qf-addr">Job address or ZIP</label><input id="qf-addr" name="address" autocomplete="postal-code"><label for="qf-notes">Anything else?</label><textarea id="qf-notes" name="notes"></textarea></fieldset>
<button class="btn" type="submit">Send quote request</button>${formStatus}</form>
<aside class="card summary" aria-labelledby="qs-h"><h2 id="qs-h" style="margin-top:0;font-size:1.2rem">Your request</h2><dl id="quote-summary"></dl><p class="hint">Price: we'll send your price after we review the details.</p></aside></div></section>` });
if (ACTION === 'order') {
  const menuHtml = (withAdd) => (content.menu || []).map((sec) => `<section class="menu-sec" id="${esc(sec.section.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}" aria-labelledby="ms-${esc(sec.section)}"><h2 id="ms-${esc(sec.section)}">${esc(sec.section)}</h2>${sec.items.map((it) => `<div class="menu-row"><div>${sampleTag(it)}<h3>${esc(it.name)}</h3><p>${esc(it.desc || '')}</p></div>${withAdd ? `<div class="menu-add">${it.options?.length ? `<label class="sr-only" for="opt-${it.id}">Option for ${esc(it.name)}</label><select class="field" id="opt-${it.id}">${opts(it.options)}</select>` : ''}<button class="btn" type="button" data-add="${esc(it.id)}" data-name="${esc(it.name)}">Add<span class="sr-only"> ${esc(it.name)}</span></button></div>` : ''}</div>`).join('')}</section>`).join('');
  const jump = `<nav class="chips" aria-label="Menu sections">${(content.menu || []).map((sec) => `<a class="chip" href="#${esc(sec.section.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${esc(sec.section)}</a>`).join('')}</nav>`;
  page('menu/', { title: 'Menu', page: 'menu', description: `Menu for ${B.name}.`, body: (pre) => `<section class="page-hero"><div class="wrap"><h1>Menu</h1><p><a class="btn" href="${pre}order/">Order pickup</a></p></div></section><section><div class="wrap">${jump}${menuHtml(false)}</div></section>` });
  page('order/', { title: 'Order pickup', page: 'order', description: `Order pickup from ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Order pickup</h1><p>Add items, pick a pickup time and send your order request. You pay at pickup. The owner confirms your order.</p>${SQUARE ? `<p><a class="btn btn-secondary" href="${esc(SQUARE)}" rel="noopener">Order and pay online</a></p>` : ''}</div></section>
<section><div class="wrap money-grid"><div>${jump}${menuHtml(true)}</div>
<aside class="card summary" aria-labelledby="cart-h"><h2 id="cart-h" style="margin-top:0;font-size:1.2rem">Your order</h2><ul id="cart" class="cart" aria-live="polite"><li class="hint">Nothing added yet.</li></ul>
<form class="form" id="order-form" novalidate><label for="of-time">Pickup time *</label><select id="of-time" name="pickup" required></select><label for="of-name">Name *</label><input id="of-name" name="name" autocomplete="name" required><label for="of-phone">Phone *</label><input id="of-phone" name="phone" type="tel" autocomplete="tel" required><label for="of-notes">Notes (allergies, requests)</label><textarea id="of-notes" name="notes"></textarea><button class="btn" type="submit">Send order request</button>${formStatus}</form></aside></div></section>` });
}
if (ACTION === 'schedule') page('schedule/', { title: 'Schedule', page: 'schedule', description: `Schedule for ${B.name}.`, body: (pre) => `<section class="page-hero"><div class="wrap"><h1>Schedule</h1><p>Times are set by the owner and can change. Call to confirm.</p></div></section><section><div class="wrap"><div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Weekly schedule</caption><thead><tr><th scope="col">Day</th><th scope="col">Time</th><th scope="col">What</th><th scope="col">Where</th></tr></thead><tbody>${(content.schedule || []).map((r) => `<tr><td>${esc(r.day)}</td><td>${esc(r.time)}</td><td>${sampleTag(r)}${esc(r.title)}</td><td>${esc(r.where || '')}</td></tr>`).join('')}</tbody></table></div>${F.booking !== false ? `<p style="margin-top:1rem"><a class="btn" href="${pre}book/">Book a first visit</a></p>` : ''}</div></section>` });
if (ACTION === 'listings') {
  const L = content.listings || [];
  page('listings/', { title: 'Listings', page: 'listings', description: `Listings from ${B.name}.`, body: (pre) => `<section class="page-hero"><div class="wrap"><h1>Listings</h1><p>Listings entered by the agent. Ask for price and availability.</p></div></section><section><div class="wrap grid">${L.map((x) => `<article class="card">${tile('Sample listing photo')}<h2 style="font-size:1.2rem">${sampleTag(x)}<a href="${pre}listings/${esc(x.id)}/">${esc(x.title)}</a></h2><p>${esc(x.area)} · ${esc(x.beds)} bed · ${esc(x.baths)} bath</p></article>`).join('')}</div>${B.brokerage ? `<p class="wrap hint">${esc(B.brokerage)}</p>` : ''}</section>` });
  for (const x of L) page(`listings/${x.id}/`, { title: x.title, page: 'listing', description: `${x.title}, ${x.area}.`, body: (pre) => `<section class="page-hero"><div class="wrap"><p><a href="${pre}listings/">Listings</a></p>${sampleTag(x)}<h1>${esc(x.title)}</h1><p>${esc(x.area)} · ${esc(x.beds)} bed · ${esc(x.baths)} bath</p></div></section><section><div class="wrap prose">${tile('Sample listing photo')}<p>${esc(x.summary)}</p><p><strong>Price:</strong> ask the agent.</p><div class="btn-row"><a class="btn" href="${pre}contact/?service=${encodeURIComponent('Showing: ' + x.title)}">Request a showing</a></div></div></section>` });
}
if (ACTION === 'packages') page('packages/', { title: 'Packages', page: 'packages', description: `Packages from ${B.name}.`, body: (pre) => `<section class="page-hero"><div class="wrap"><h1>Packages</h1><p>Ask for pricing and open dates.</p></div></section><section><div class="wrap grid">${(content.packages || []).map((k) => `<article class="card">${sampleTag(k)}<h2 style="font-size:1.3rem;margin-top:0">${esc(k.name)}</h2><ul>${k.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><a class="btn" href="${pre}contact/?service=${encodeURIComponent(k.name)}">Ask about ${esc(k.name)}</a></article>`).join('')}</div></section>` });
page('login/', { title: 'Log in', page: 'login', noindex: true, description: `Customer and owner login for ${B.name}.`, body: () => `<section class="page-hero"><div class="wrap"><h1>Log in</h1><p>Customers can see quotes, invoices, project status, photos and messages.</p></div></section>
<section><div class="wrap grid"><form class="form card" id="login-form" novalidate><label for="li-email">Email</label><input id="li-email" name="email" type="email" autocomplete="username" required><label for="li-pass">Password</label><input id="li-pass" name="password" type="password" autocomplete="current-password" required><button class="btn" type="submit">Log in</button>${formStatus}</form>
${DEMO ? `<div class="demo-logins" aria-label="Demo logins"><h2 style="margin-top:0;font-size:1.2rem">Demo logins (sample data)</h2><p><strong>Owner:</strong> <code>owner@demo.test</code> / <code>demo-owner</code></p><p><strong>Customer:</strong> <code>customer@demo.test</code> / <code>demo-customer</code></p><p class="hint" style="color:#44403c">Data is stored in this browser only. Use “Reset demo data” in the dashboard to start over.</p></div>` : ''}</div></section>` });
if (MEDICAL) page('portal/', { title: 'Patient portal', page: 'medical-portal', noindex: true, description: 'Patient portal', body: () => `<section class="page-hero"><div class="wrap"><h1>Patient portal</h1><p>For your privacy, health records and forms are handled in the practice's own patient portal, not on this website.</p>${B.patientPortalUrl ? `<p><a class="btn" href="${esc(B.patientPortalUrl)}" rel="noopener">Open the patient portal</a></p>` : '<p class="hint">Owner: set business.patientPortalUrl in site.config.json.</p>'}</div></section>` });
else page('portal/', { title: 'Customer portal', page: 'portal', noindex: true, description: 'Customer portal', body: () => `<section class="page-hero"><div class="wrap"><h1>My account</h1><p id="who"></p></div></section><section><div class="wrap" id="app" aria-live="polite"></div></section>` });
page('admin/', { title: 'Owner dashboard', page: 'admin', noindex: true, description: 'Owner dashboard', body: () => `<section class="page-hero"><div class="wrap"><h1>Owner dashboard</h1><p id="who"></p></div></section><section><div class="wrap" id="app" aria-live="polite"></div></section>` });

fs.writeFileSync(path.join(OUT, 'robots.txt'), DEMO ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nDisallow: /login/\nDisallow: /portal/\nDisallow: /admin/\nDisallow: /api/\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((r) => `  <url><loc>${esc(`${siteUrl}/${r}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'build.json'), JSON.stringify({ mode: DEMO ? 'demo' : 'api', trade: tradeKey, theme: themeKey, pages: sitemap.length }, null, 2));
console.log(`Built ${DEMO ? 'demo' : 'server'} site → ${path.relative(ROOT, OUT)} (trade ${tradeKey}, theme ${themeKey}, ${sitemap.length} indexed pages)`);
