// Config-driven home page (spec v4 A3/A4): section order from LAYOUTS[layout] and one of the
// 9 HEROES (both vendored in design.vendor.mjs from client-site-templates). Only used when
// `layout` or `hero` is set, so the default home page stays as it was.
import { LAYOUTS, HEROES, layoutHero } from './design.vendor.mjs';
import { esc, md } from '../src/md.mjs';

export function resolveHome(cfg, opt, resolveDesign, tradeKey) {
  const layoutRaw = opt('layout', cfg.layout); const heroRaw = opt('hero', cfg.hero);
  if (!layoutRaw && !heroRaw) return null;
  const layout = resolveDesign('layout', layoutRaw || 'auto', tradeKey, tradeKey, (m) => console.warn('⚠ ' + m));
  const hero = (heroRaw && heroRaw !== 'auto' ? resolveDesign('hero', heroRaw, tradeKey, tradeKey) : null) || layoutHero(layout);
  const img = opt('hero-image', cfg.heroImage) || '';
  if (img && !/^(https:\/\/|\.{0,2}\/|[\w-]+\/)[^"'()<>\s]+$/.test(img)) throw new Error('heroImage must be an https URL or a relative path');
  return { layout, hero, heroImage: img, order: LAYOUTS[layout].filter((k) => !k.startsWith('hero:')) };
}
export { HEROES, LAYOUTS };

export function homeBody(pre, h, x) {
  const { B, F, services, content, label, cityLine, tel, ACTION, ACTION_LABEL, head, projectCard, reviewCard, tile, sampleTag } = x;
  const act = `${pre}${ACTION}/`;
  const cta = `<div class="btn-row hero-actions"><a class="btn" href="${act}">${esc(ACTION_LABEL)}</a><a class="btn btn-ghost" href="${tel}">Call ${esc(B.phone)}</a></div>`;
  const badge = `<span class="hero-badge">${esc(label)}${esc(cityLine)}</span>`;
  const h1 = `<h1 data-content="headline">${esc(B.tagline || B.name)}</h1>`;
  const intro = `<p data-content="intro">${esc(`${B.name} offers ${services.map((s) => s.name.toLowerCase()).join(', ')}${cityLine}.`)}</p>`;
  const imgStyle = h.heroImage ? ` style="--hero-img:url('${esc(h.heroImage.startsWith('https://') ? h.heroImage : pre + h.heroImage.replace(/^\.?\//, ''))}')"` : '';
  const photo = h.heroImage ? '' : '<span class="hero-ph-note">Sample hero area: add the client\'s own photo with heroImage</span>';
  const creds = [B.license, B.brokerage, B.years ? `${B.years} years in business` : ''].filter(Boolean);
  const sched = (content.schedule || []).slice(0, 4);
  const mosaic = (content.projects || []).slice(0, 5);
  const heroes = {
    split: `<div class="wrap hero-split"><div>${badge}${h1}${intro}${cta}</div><aside class="hero-panel" aria-label="${esc(ACTION_LABEL)}"><h2>${esc(ACTION_LABEL)}</h2><ul>${services.slice(0, 4).map((s) => `<li>${esc(s.name)}</li>`).join('')}</ul><a class="btn" href="${act}">Start</a></aside></div>`,
    centered: `<div class="wrap hero-center">${badge}${h1}${intro}${cta}</div>`,
    media: `<div class="wrap">${photo}${badge}${h1}${intro}${cta}</div>`,
    search: `<div class="wrap hero-center">${badge}${h1}${intro}<form class="hero-search" action="${pre}listings/" role="search"><label class="sr-only" for="hs-q">Search listings by area or type</label><input id="hs-q" name="q" placeholder="Area, neighborhood or type"><button class="btn" type="submit">Search listings</button></form><p><a class="hero-call" href="${tel}">Call ${esc(B.phone)}</a></p></div>`,
    schedule: `<div class="wrap hero-split"><div>${badge}${h1}${intro}${cta}</div>${sched.length ? `<div><h2 class="hero-strip-h">This week</h2><ul class="hero-strip">${sched.map((r) => `<li><strong>${esc(r.day)} ${esc(r.time)}</strong>${esc(r.title)}${r.sample ? ' <em>(sample)</em>' : ''}</li>`).join('')}</ul></div>` : ''}</div>`,
    'menu-first': `<div class="wrap">${badge}${h1}<div class="btn-row hero-actions"><a class="btn" href="${act}">${esc(ACTION_LABEL)}</a>${ACTION === 'order' ? `<a class="btn btn-ghost" href="${pre}menu/">See the menu</a>` : ''}<a class="btn btn-ghost" href="${tel}">Call ${esc(B.phone)}</a></div></div>`,
    portfolio: `<div class="wrap">${badge}${h1}${intro}${cta}<div class="hero-mosaic">${mosaic.map((p) => (p.after ? `<img src="${esc(p.after)}" alt="${esc(p.title)}" loading="lazy">` : tile(p.sample ? 'Sample photo' : p.title))).join('')}</div></div>`,
    proof: `<div class="wrap">${badge}${h1}${intro}${creds.length ? `<ul class="hero-proof">${creds.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${cta}</div>`,
    emergency: `<div class="hero-urgent" role="note"><div class="wrap"><strong>Need help now?</strong> <a class="btn" href="${tel}">Call ${esc(B.phone)}</a></div></div><div class="wrap">${badge}${h1}${intro}${cta}</div>`,
  };
  const hero = `<section class="hero hero--${h.hero}${h.heroImage ? ' has-img' : ''}" id="hero"${imgStyle}>${heroes[h.hero]}</section>`;
  const sec = (id, inner, cls = '') => `<section id="${id}"${cls ? ` class="${cls}"` : ''}><div class="wrap">${inner}</div></section>`;
  const moneyInner = {
    quote: `${head(ACTION_LABEL, 'Answer a few questions and we will send your price.')}<a class="btn" href="${act}">Start your quote</a>`,
    book: `${head(ACTION_LABEL, 'Pick a service and an open time. We confirm each request.')}<a class="btn" href="${act}">See open times</a>`,
    order: `${head('Order pickup', 'Add items, pick a time, pay at pickup.')}<a class="btn" href="${act}">Start an order</a>`,
    schedule: `${head('Schedule', 'Times are set by the owner and can change.')}<a class="btn" href="${act}">Full schedule</a>`,
    listings: `${head('Listings', 'Homes entered by the agent.')}<a class="btn" href="${act}">View listings</a>`,
    packages: `${head('Packages', 'Ask for pricing and open dates.')}<a class="btn" href="${act}">See packages</a>`,
  }[ACTION];
  const blocks = {
    money: sec('money', moneyInner, 'band'),
    booking: F.booking !== false ? sec('booking', `${head('Book online', 'Request a time that works for you.')}<a class="btn" href="${pre}book/">Book a visit</a>`, 'band') : '',
    services: sec('services', `${head('Services', 'What we do.')}<div class="grid">${services.map((s) => `<article class="card"><h3>${esc(s.name)}</h3><p>${esc(s.summary)}</p><a class="more" href="${pre}services/${s.slug}/">Learn about ${esc(s.name)}</a></article>`).join('')}</div>`),
    'before-after': F.gallery !== false ? sec('before-after', `${head('Recent projects', 'Drag the slider to compare before and after.')}<div class="grid" data-list="projects" data-limit="3">${content.projects.slice(0, 3).map(projectCard).join('')}</div><p><a class="btn btn-secondary" href="${pre}gallery/">See the gallery</a></p>`) : '',
    gallery: F.gallery !== false ? sec('gallery', `${head('Gallery')}<div class="grid" data-list="projects" data-limit="3">${content.projects.slice(0, 3).map(projectCard).join('')}</div><p><a class="btn btn-secondary" href="${pre}gallery/">See the gallery</a></p>`) : '',
    reviews: F.reviews !== false && content.reviews.length ? sec('reviews', `${head('Reviews')}<div class="grid">${content.reviews.slice(0, 3).map(reviewCard).join('')}</div>`) : '',
    areas: F.serviceArea !== false && (B.serviceAreas || []).length ? sec('areas', `${head('Areas we serve')}<ul class="areas">${B.serviceAreas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul><p><a href="${pre}service-area/">Service area details</a></p>`) : '',
    map: B.mapQuery ? sec('map', `${head('Find us')}<iframe class="map-frame" title="Map of ${esc(B.mapQuery)}" loading="lazy" src="https://maps.google.com/maps?q=${encodeURIComponent(B.mapQuery)}&z=10&output=embed"></iframe>`) : '',
    hours: B.hours ? sec('hours', `${head('Hours')}<p class="hours-text">${esc(B.hours)}</p>`) : '',
    faq: F.faq !== false && content.faq.length ? sec('faq', `${head('Questions')}<div class="faq prose">${content.faq.slice(0, 3).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div><p><a href="${pre}faq/">All questions</a></p>`) : '',
    about: sec('about', `${head(`About ${B.name}`)}<div class="prose" data-content="about">${md(B.about)}</div>`),
    menu: (content.menu || []).length ? sec('menu', `${head('Menu')}<div class="grid">${content.menu.map((m) => `<article class="card"><h3>${esc(m.section)}</h3><p>${m.items.map((i) => esc(i.name)).join(', ')}</p><a class="more" href="${pre}menu/#${esc(m.section.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">See ${esc(m.section)}</a></article>`).join('')}</div>`) : '',
    schedule: (content.schedule || []).length ? sec('schedule', `${head('This week')}<div class="grid">${content.schedule.map((r) => `<article class="card">${sampleTag(r)}<h3>${esc(r.title)}</h3><p>${esc(r.day)} ${esc(r.time)}${r.where ? ' · ' + esc(r.where) : ''}</p></article>`).join('')}</div>`) : '',
    listings: (content.listings || []).length && ACTION === 'listings' ? sec('listings', `${head('Featured listings')}<div class="grid">${content.listings.slice(0, 3).map((l) => `<article class="card">${tile('Sample listing photo')}<h3>${sampleTag(l)}<a href="${pre}listings/${esc(l.id)}/">${esc(l.title)}</a></h3><p>${esc(l.area)} · ${esc(l.beds)} bed · ${esc(l.baths)} bath</p></article>`).join('')}</div>`) : '',
    packages: (content.packages || []).length && ACTION === 'packages' ? sec('packages', `${head('Packages', 'Ask for pricing and open dates.')}<div class="grid">${content.packages.map((k) => `<article class="card">${sampleTag(k)}<h3>${esc(k.name)}</h3><ul>${k.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></article>`).join('')}</div>`) : '',
    team: (content.team || []).length ? sec('team', `${head('Team')}<div class="grid">${content.team.map((t) => `<article class="card">${sampleTag(t)}<h3>${esc(t.name)}</h3><p>${esc(t.role || '')}</p></article>`).join('')}</div>`) : '',
    contact: sec('contact', `${head('Ready to start?', 'Tell us what you need and we will get back to you.')}<div class="btn-row"><a class="btn" href="${act}">${esc(ACTION_LABEL)}</a><a class="btn btn-ghost" href="${pre}contact/">Contact us</a>${F.portal !== false ? `<a class="btn btn-secondary" href="${pre}login/">Customer login</a>` : ''}</div>`),
  };
  const seen = new Set(); const out = [];
  for (const k of [...h.order, 'contact']) { if (seen.has(k) || !(k in blocks)) continue; seen.add(k); if (blocks[k]) out.push(blocks[k]); }
  return '\n' + hero + '\n' + out.join('\n');
}

export const HERO_CSS = `
/* Home hero variants (spec v4 A3) */
.hero { color: var(--hero-text, #fff); }
.hero-split { display: grid; gap: 2rem; align-items: center; }
@media (min-width: 900px) { .hero-split { grid-template-columns: 1.4fr 1fr; } }
.hero-panel { background: var(--card); color: var(--text); border-radius: var(--radius); padding: 1.5rem; box-shadow: var(--shadow); }
.hero-panel h2 { margin-top: 0; font-size: 1.3rem; } .hero-panel ul { padding-left: 1.1rem; }
.hero-center { text-align: center; } .hero-center p, .hero-center h1 { margin-inline: auto; max-width: 46rem; } .hero-center .btn-row { justify-content: center; }
.hero--media { min-height: min(72vh, 640px); display: flex; align-items: flex-end; background: linear-gradient(160deg, var(--hero-deep), #0b0f17) !important; color: #fff !important; }
.hero--media.has-img, .hero--portfolio.has-img { background: #0b0f17 var(--hero-img) center / cover no-repeat !important; }
.hero--media::after, .hero--portfolio.has-img::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.78)); pointer-events: none; }
.hero--media .wrap, .hero--portfolio .wrap { position: relative; z-index: 1; width: min(1120px, 100% - 2rem); }
.hero--media h1, .hero--media p, .hero--media .hero-badge, .hero--media .btn-ghost { color: #fff !important; }
.hero--media .btn-ghost { border-color: #fff !important; }
.hero-ph-note { display: inline-block; margin-bottom: .75rem; font-size: .85rem; background: rgba(0,0,0,.55); color: #fff; padding: .2rem .7rem; border-radius: 999px; }
.hero-search { display: flex; gap: .5rem; flex-wrap: wrap; justify-content: center; max-width: 640px; margin: 1.25rem auto 0; }
.hero-search input { flex: 1 1 240px; min-height: 52px; padding: 0 1rem; border-radius: 10px; border: 2px solid #fff; font: inherit; color: #0f172a; background: #fff; }
.hero-call { color: inherit; font-weight: 700; display: inline-block; min-height: 44px; padding-top: .6rem; }
.hero-strip-h { font-size: 1.1rem; margin: 0 0 .5rem; color: inherit; }
.hero-strip { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
.hero-strip li { background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.4); border-radius: 10px; padding: .6rem .8rem; color: #fff; }
.hero-strip strong { display: block; }
.hero--menu-first { padding: clamp(2rem, 5vw, 3rem) 0 !important; min-height: 0; }
.hero-mosaic { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: .5rem; margin-top: 1.5rem; }
.hero-mosaic img, .hero-mosaic .ph-tile { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; }
.hero-proof { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 1.25rem; }
.hero-proof li { border: 1px solid currentColor; border-radius: 999px; padding: .3rem .9rem; font-weight: 700; }
.hero-urgent { background: #991b1b; color: #fff; padding: .75rem 0; margin: calc(-1 * clamp(3rem, 8vw, 6rem)) 0 2rem; position: relative; z-index: 1; }
.hero-urgent .wrap { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; font-size: 1.2rem; }
.band { background: var(--hero-tint); color: #0f172a; } .band .section-head p { color: #334155; }
`;
