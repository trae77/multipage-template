// Vendored from trae77/client-site-templates tools/design.mjs (palettes + font pairs). Keep in sync.
// Spec v1 P2: per-industry design system (palettes, Google Font pairings, section order, hero layouts).
// Everything here is opt-in: tools/mockup.mjs only uses it when --palette, --fonts, --layout, --hero
// or --hero-img is passed, so builds without those flags stay byte-identical.

/** Exact palettes from specs/spec-v1.md P2 (all text pairings pass WCAG AA; checked again at build). */
export const PALETTES = {
  roofing: { primary: '#7C2D12', accent: '#F59E0B', ctaText: '#111827', bg: '#FFFBF5', text: '#1C1917', muted: '#57534E' },
  hvac: { primary: '#1D4ED8', accent: '#DC2626', ctaText: '#FFFFFF', bg: '#FFFFFF', text: '#0F172A', muted: '#475569' },
  plumbing: { primary: '#0B3B66', accent: '#F2B705', ctaText: '#0B1B2B', bg: '#F7FAFC', text: '#0F172A', muted: '#4A5568' },
  electrician: { primary: '#1E293B', accent: '#FACC15', ctaText: '#111827', bg: '#FFFFFF', text: '#0F172A', muted: '#475569' },
  landscaping: { primary: '#166534', accent: '#CA8A04', ctaText: '#111827', bg: '#F7F5EE', text: '#1A2E1A', muted: '#4D5B4D' },
  painting: { primary: '#0F766E', accent: '#C2410C', ctaText: '#FFFFFF', bg: '#FDF8F1', text: '#1F2937', muted: '#57534E' },
  cleaning: { primary: '#0E7490', accent: '#0369A1', ctaText: '#FFFFFF', bg: '#F0FDFF', text: '#0F172A', muted: '#475569' },
  'pressure-washing': { primary: '#0B5394', accent: '#F1C232', ctaText: '#111827', bg: '#FFFFFF', text: '#0F172A', muted: '#475569' },
  handyman: { primary: '#9A3412', accent: '#1E3A8A', ctaText: '#FFFFFF', bg: '#FAFAF9', text: '#1C1917', muted: '#57534E' },
  'auto-repair': { primary: '#991B1B', accent: '#FBBF24', ctaText: '#111827', bg: '#F8FAFC', text: '#111827', muted: '#4B5563' },
  'auto-detailing': { primary: '#0A0A0A', accent: '#38BDF8', ctaText: '#0A0A0A', bg: '#111111', text: '#F5F5F5', muted: '#A3A3A3' },
  'salon-barber': { primary: '#2A1B3D', accent: '#D8B4FE', ctaText: '#1A1025', bg: '#140D1C', text: '#F5EFFA', muted: '#BBAFC8' },
  'restaurant-foodtruck': { primary: '#7F1D1D', accent: '#B45309', ctaText: '#FFFFFF', bg: '#FFF8EE', text: '#2B1A12', muted: '#6B4F3F' },
  fitness: { primary: '#111827', accent: '#22C55E', ctaText: '#052E16', bg: '#0B0F17', text: '#F9FAFB', muted: '#9CA3AF' },
  'pet-services': { primary: '#0E7490', accent: '#BE185D', ctaText: '#FFFFFF', bg: '#FFFBF7', text: '#1F2937', muted: '#57534E' },
  'dental-medical': { primary: '#0369A1', accent: '#0F766E', ctaText: '#FFFFFF', bg: '#FFFFFF', text: '#0F172A', muted: '#475569' },
  'real-estate': { primary: '#1E3A8A', accent: '#D4A017', ctaText: '#0F172A', bg: '#0F172A', text: '#F8FAFC', muted: '#CBD5E1' },
  'pest-control': { primary: '#14532D', accent: '#EAB308', ctaText: '#111827', bg: '#FFFFFF', text: '#0F172A', muted: '#475569' },
  photography: { primary: '#18181B', accent: '#E11D48', ctaText: '#FFFFFF', bg: '#FAFAFA', text: '#18181B', muted: '#52525B' },
};
const KEY_ALIAS = { 'cleaning-service': 'cleaning', restaurant: 'restaurant-foodtruck', 'restaurant-ordering': 'restaurant-foodtruck', 'food-truck': 'foodtruck' };

/** Google Font pairings (spec v4 A2), 2 weights max per family, loaded with display=swap + preconnect. */
export const FONT_PAIRS = {
  industrial: { heading: ['Oswald', 600], body: ['Inter', '400;600'], fallback: 'Arial Narrow, system-ui, sans-serif' },
  utility: { heading: ['Barlow Semi Condensed', 700], body: ['Source Sans 3', '400;600'], fallback: 'system-ui, sans-serif' },
  craft: { heading: ['Fraunces', 600], body: ['Nunito Sans', '400;700'], fallback: 'Georgia, serif' },
  bistro: { heading: ['Playfair Display', 700], body: ['Lato', '400;700'], fallback: 'Georgia, serif' },
  street: { heading: ['Bebas Neue', 400], body: ['Work Sans', '400;600'], fallback: 'Impact, system-ui, sans-serif' },
  atelier: { heading: ['Cormorant Garamond', 600], body: ['Montserrat', '400;600'], fallback: 'Georgia, serif' },
  power: { heading: ['Anton', 400], body: ['Inter', '400;600'], fallback: 'Impact, system-ui, sans-serif' },
  care: { heading: ['Nunito', 700], body: ['Inter', '400;600'], fallback: 'system-ui, sans-serif' },
  estate: { heading: ['Libre Baskerville', 700], body: ['Inter', '400;600'], fallback: 'Georgia, serif' },
  gallery: { heading: ['DM Serif Display', 400], body: ['DM Sans', '400;700'], fallback: 'Georgia, serif' },
};
const FONT_DEFAULT = {
  roofing: 'industrial', electrician: 'industrial', 'auto-repair': 'industrial', 'pressure-washing': 'industrial', 'pest-control': 'industrial',
  hvac: 'utility', plumbing: 'utility', cleaning: 'utility', handyman: 'utility',
  landscaping: 'craft', painting: 'craft', 'pet-services': 'craft',
  'restaurant-foodtruck': 'bistro', foodtruck: 'street', 'salon-barber': 'atelier', fitness: 'power', 'dental-medical': 'care',
  'real-estate': 'estate', photography: 'gallery', 'auto-detailing': 'gallery',
};

/** Section order variants (spec v4 A4). Plain arrays; 'hero:<id>' sets the default --hero.
 *  Section keys map to section ids via SECTION_IDS. Sections a layout doesn't name keep their
 *  relative order after the named ones (nothing is dropped); contact is always last. */
export const LAYOUTS = {
  'trade-lead': ['hero:split', 'money', 'services', 'before-after', 'reviews', 'areas', 'map', 'faq', 'contact'],
  'trade-emergency': ['hero:emergency', 'money', 'services', 'areas', 'map', 'reviews', 'hours', 'faq', 'contact'],
  'trade-proof': ['hero:proof', 'services', 'before-after', 'reviews', 'money', 'areas', 'faq', 'contact'],
  'home-quote': ['hero:split', 'money', 'services', 'before-after', 'reviews', 'areas', 'faq', 'contact'],
  'home-visual': ['hero:media', 'before-after', 'services', 'money', 'reviews', 'faq', 'contact'],
  'auto-service': ['hero:split', 'money', 'services', 'hours', 'map', 'reviews', 'faq', 'contact'],
  'auto-packages': ['hero:media', 'packages', 'gallery', 'money', 'reviews', 'faq', 'contact'],
  'salon-book': ['hero:centered', 'booking', 'services', 'team', 'gallery', 'reviews', 'hours', 'map', 'faq', 'contact'],
  'salon-look': ['hero:media', 'gallery', 'services', 'booking', 'team', 'reviews', 'faq', 'contact'],
  'salon-team': ['hero:centered', 'team', 'services', 'booking', 'reviews', 'hours', 'map', 'contact'],
  'rest-order': ['hero:menu-first', 'menu', 'money', 'hours', 'map', 'gallery', 'reviews', 'faq', 'contact'],
  'rest-dine': ['hero:media', 'menu', 'hours', 'map', 'gallery', 'reviews', 'events', 'faq', 'contact'],
  'truck-where': ['hero:media', 'hours', 'schedule', 'menu', 'money', 'gallery', 'faq', 'contact'],
  'fit-schedule': ['hero:schedule', 'schedule', 'money', 'services', 'team', 'reviews', 'faq', 'contact'],
  'fit-first-visit': ['hero:media', 'about', 'money', 'schedule', 'faq', 'reviews', 'contact'],
  'fit-community': ['hero:media', 'gallery', 'reviews', 'services', 'money', 'faq', 'contact'],
  'pet-book': ['hero:centered', 'money', 'services', 'gallery', 'reviews', 'areas', 'faq', 'contact'],
  'pet-trust': ['hero:proof', 'about', 'services', 'money', 'reviews', 'faq', 'contact'],
  'care-visit': ['hero:centered', 'money', 'services', 'about', 'team', 'reviews', 'hours', 'map', 'faq', 'contact'],
  'care-proof': ['hero:proof', 'team', 'services', 'money', 'hours', 'map', 'faq', 'contact'],
  'care-calm': ['hero:media', 'services', 'money', 'reviews', 'faq', 'contact'],
  're-search': ['hero:search', 'listings', 'about', 'areas', 'reviews', 'contact'],
  're-seller': ['hero:proof', 'money', 'listings', 'reviews', 'about', 'contact'],
  're-agent': ['hero:centered', 'about', 'listings', 'areas', 'reviews', 'faq', 'contact'],
  'photo-portfolio': ['hero:portfolio', 'gallery', 'packages', 'money', 'reviews', 'faq', 'contact'],
  'photo-packages': ['hero:media', 'packages', 'gallery', 'process', 'money', 'faq', 'contact'],
};
const SECTION_IDS = { money: ['money', 'quote', 'order'], booking: ['booking', 'money'], listings: ['money', 'listings'], packages: ['pricing', 'packages', 'included'],
  schedule: ['schedule', 'money'], reviews: ['testimonials', 'reviews'], areas: ['zip', 'areas', 'service-area'], menu: ['menu'], events: ['events', 'catering'] };
const LAYOUT_DEFAULT = {
  roofing: 'trade-lead', handyman: 'trade-lead', painting: 'trade-lead', 'pest-control': 'trade-lead',
  hvac: 'trade-emergency', plumbing: 'trade-emergency', electrician: 'trade-emergency',
  cleaning: 'home-quote', landscaping: 'home-quote', 'pressure-washing': 'home-quote',
  'auto-repair': 'auto-service', 'auto-detailing': 'auto-packages', 'salon-barber': 'salon-book',
  'restaurant-foodtruck': 'rest-order', foodtruck: 'truck-where', fitness: 'fit-schedule', 'pet-services': 'pet-book',
  'dental-medical': 'care-visit', 'real-estate': 're-search', photography: 'photo-portfolio',
};
export const HEROES = ['split', 'centered', 'media', 'search', 'schedule', 'menu-first', 'portfolio', 'proof', 'emergency'];
export const layoutHero = (id) => (LAYOUTS[id]?.find((k) => k.startsWith('hero:')) || 'hero:split').slice(5);

const keyOf = (tradeKey, folder) => [tradeKey, KEY_ALIAS[tradeKey], folder, KEY_ALIAS[folder]].find((k) => k && (PALETTES[k] || FONT_DEFAULT[k] || LAYOUT_DEFAULT[k])) || folder;
/** Resolve a flag value ("auto" = industry default). Unknown layout -> industry default + warning (v4 A4). */
export function resolveDesign(kind, value, tradeKey, folder, warn = () => {}) {
  if (value == null) return null;
  const k = keyOf(tradeKey, folder);
  const auto = value === 'auto' || value === '' || value === true;
  if (kind === 'hero') {
    if (auto) return null; // caller falls back to the layout's hero, then split
    if (!HEROES.includes(value)) throw new Error(`--hero must be one of: auto, ${HEROES.join(', ')}`);
    return value;
  }
  if (kind === 'layout') {
    if (!auto && LAYOUTS[value]) return value;
    if (!auto) warn(`Unknown --layout "${value}"; using the industry default (${LAYOUT_DEFAULT[k] || 'trade-lead'}). Options: ${Object.keys(LAYOUTS).join(', ')}`);
    return LAYOUT_DEFAULT[k] || 'trade-lead';
  }
  const table = kind === 'palette' ? PALETTES : FONT_PAIRS;
  const v = auto ? (kind === 'palette' ? (PALETTES[k] && k) : FONT_DEFAULT[k]) : value;
  if (!v) return null; // no industry default (e.g. church): leave the template as is
  if (!table[v]) throw new Error(`--${kind} must be auto or one of: ${Object.keys(table).join(', ')}`);
  return v;
}

/** <link> tags for a font pair: preconnect + one css2 request with display=swap. */
export function fontLinks(pairKey) {
  const p = FONT_PAIRS[pairKey];
  const fam = ([n, w]) => `family=${n.replace(/ /g, '+')}:wght@${w}`;
  const fams = p.heading[0] === p.body[0] ? [p.body] : [p.heading, p.body];
  return `<link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?${fams.map(fam).join('&')}&display=swap" rel="stylesheet">`;
}
export function fontCss(pairKey) {
  const p = FONT_PAIRS[pairKey];
  return `\n/* Fonts: ${pairKey} (${p.heading[0]} / ${p.body[0]}) */\n:root { --font: '${p.body[0]}', ${p.fallback}; --font-heading: '${p.heading[0]}', ${p.fallback}; }\nbody { font-family: var(--font); }\nh1, h2, h3, .logo { font-family: var(--font-heading); font-weight: ${p.heading[1]}; letter-spacing: 0; }\n`;
}

/** Reorder top-level <section id> blocks inside <main> (hero stays first, contact last). */
export function applyLayout(html, layoutKey) {
  const order = LAYOUTS[layoutKey].filter((k) => !k.startsWith('hero:')).flatMap((k) => SECTION_IDS[k] || [k]);
  const start = html.indexOf('<main'); const end = html.indexOf('</main>');
  if (start < 0 || end < 0) return html;
  const open = html.indexOf('>', start) + 1;
  const body = html.slice(open, end);
  const re = /[ \t]*<section\b[\s\S]*?<\/section>\n?/g;
  const blocks = body.match(re) || [];
  if (blocks.some((b) => (b.match(/<section\b/g) || []).length > 1)) return html; // nested: don't touch
  const lead = body.slice(0, body.search(re)); const tail = body.replace(re, '').slice(lead.length);
  const idOf = (b) => (b.match(/<section[^>]*\bid="([^"]+)"/) || [])[1] || '';
  const hero = blocks.filter((b) => /<section[^>]*class="hero/.test(b));
  const rest = blocks.filter((b) => !hero.includes(b));
  const rank = (b) => { const i = order.indexOf(idOf(b)); return idOf(b) === 'contact' ? 1e4 : i < 0 ? 5e3 : i; };
  const sorted = rest.map((b, i) => [b, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([b]) => b);
  return html.slice(0, open) + lead + [...hero, ...sorted].join('') + tail + html.slice(end);
}

/** CSS for the 9 hero variants (spec v4 A3). `img` = relative URL of the client's hero photo (optional). */
export function heroCss(kind, img) {
  const photo = img ? `.hero::before { background-image: url('${img}'); opacity: 1; mix-blend-mode: normal; }\n` : '';
  const scrim = `.hero--${kind}::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.2) 0%, rgba(0,0,0,.72) 100%); pointer-events: none; }\n.hero--${kind} > * { position: relative; z-index: 1; }\n.hero--${kind}, .hero--${kind} h1, .hero--${kind} .lead, .hero--${kind} .hero-badge, .hero--${kind} .lead a { color: #fff; }\n`;
  const css = {
    split: `@media (min-width: 900px) { .hero--split .container { text-align: left; } .hero--split .container > * { max-width: 640px; margin-left: 0; } .hero--split .hero-actions, .hero--split .trust-row { justify-content: flex-start; } }\n`,
    centered: `.hero--centered .container { text-align: center; }\n.hero--centered .container > * { max-width: 760px; margin-left: auto; margin-right: auto; }\n.hero--centered .hero-actions, .hero--centered .trust-row { justify-content: center; }\n`,
    media: `.hero--media { min-height: min(78vh, 720px); display: flex; align-items: flex-end; }\n.hero--media .container { text-align: left; width: 100%; }\n.hero--media .hero-actions { justify-content: flex-start; }\n${scrim}`,
    search: `.hero-search { display: flex; gap: .5rem; max-width: 620px; margin: 1.25rem auto 0; flex-wrap: wrap; }\n.hero-search input { flex: 1 1 240px; min-height: 52px; padding: 0 1rem; border-radius: 10px; border: 2px solid rgba(255,255,255,.75); font: inherit; font-size: 1.05rem; color: #0f172a; background: #fff; }\n.hero-search button { min-height: 52px; }\n`,
    schedule: `.hero-strip { list-style: none; padding: 0; margin: 1.25rem 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .5rem; }\n.hero-strip li { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.35); border-radius: 10px; padding: .6rem .75rem; font-size: .95rem; }\n.hero-strip strong { display: block; }\n`,
    'menu-first': `.hero--menu-first { min-height: 40vh; padding-top: 3rem; padding-bottom: 2.5rem; display: flex; align-items: center; }\n.hero--menu-first .container { width: 100%; }\n`,
    portfolio: `.hero-mosaic { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .4rem; margin-top: 1.5rem; }\n.hero-mosaic img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; display: block; }\n`,
    proof: `.hero--proof .trust-row { margin: 1rem 0 1.25rem; font-weight: 700; }\n`,
    emergency: `.hero-band { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: .5rem 1rem; margin: 0 0 1.25rem; padding: .75rem 1rem; border-radius: 12px; background: #7f1d1d; color: #fff; font-weight: 700; font-size: 1.15rem; }\n.hero-band .btn-call { background: #fbbf24; color: #111827; font-size: 1.25rem; min-height: 56px; padding: 0 1.4rem; border-radius: 12px; display: inline-flex; align-items: center; text-decoration: none; font-weight: 800; }\n`,
  }[kind];
  return `\n/* Hero: ${kind} (spec v4 A3) */\n${photo}${css}`;
}

/** Add the hero class and the per-variant markup. Only uses facts already in the page/flags. */
export function applyHero(html, kind, { ctx = {}, schedule = null } = {}) {
  let out = html.replace(/<section class="hero"/, `<section class="hero hero--${kind}"`);
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const afterActions = (extra) => { out = out.replace(/(<div class="hero-actions">[\s\S]*?\n[ \t]*<\/div>(?:\s*<ul class="trust-row"[\s\S]*?<\/ul>)?)/, (m) => m + extra); };
  if (kind === 'search') {
    afterActions(`\n        <form class="hero-search" role="search" action="#money" data-hero-search><label for="hero-q">Area, city or ZIP</label><input id="hero-q" name="q" type="search" placeholder="Area, city or ZIP" autocomplete="off"><button class="btn btn-primary" type="submit">Search</button></form>\n        <script>document.querySelector('[data-hero-search]').addEventListener('submit',function(e){e.preventDefault();var q=document.getElementById('hero-q').value;var m=document.getElementById('money')||document.getElementById('contact');var f=m&&m.querySelector('input[type=search],input[type=text]');if(f){f.value=q;f.dispatchEvent(new Event('input',{bubbles:true}));}if(m)m.scrollIntoView({behavior:'smooth'});});</script>`);
  } else if (kind === 'schedule' && Array.isArray(schedule) && schedule.length) {
    const items = schedule.slice(0, 4).map((c) => `<li><strong>${esc(c.day || '')} ${esc(c.time || '')}</strong>${esc(c.name || c.class || c.title || '')}</li>`).join('');
    afterActions(`\n        <ul class="hero-strip" aria-label="This week">${items}</ul>`);
  } else if (kind === 'portfolio') {
    const imgs = [...out.matchAll(/<section id="gallery"[\s\S]*?<\/section>/g)].flatMap((m) => [...m[0].matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)]).slice(0, 5);
    if (imgs.length >= 3) afterActions(`\n        <div class="hero-mosaic">${imgs.map((m) => `<img src="${m[1]}" alt="" loading="eager" width="400" height="300">`).join('')}</div>`);
  } else if (kind === 'proof') {
    out = out.replace(/(<div class="hero-actions">[\s\S]*?\n[ \t]*<\/div>)(\s*)(<ul class="trust-row"[\s\S]*?<\/ul>)/, '$3$2$1');
  } else if (kind === 'emergency' && ctx.tel) {
    out = out.replace(/(<section class="hero[^"]*"[^>]*>\s*<div class="container">)/, `$1\n        <p class="hero-band">Need help now? <a class="btn-call" href="${ctx.tel}">Call ${esc(ctx.phoneDisplay)}</a></p>`);
  }
  return out;
}

/** Palette CSS + the contrast pairs it must pass. */
export function paletteCss(key, { mix, rgba, ensureContrast }) {
  const p = PALETTES[key];
  const dark = isDarkBg(p.bg);
  const card = mix(p.bg, dark ? '#ffffff' : '#ffffff', dark ? 0.06 : 0.6);
  const link = ensureContrast(p.primary, card, 4.5);
  const linkBg = ensureContrast(link, p.bg, 4.5);
  const css = `\n/* Palette: ${key} (specs/spec-v1.md P2) */\n:root { --bg: ${p.bg}; --text: ${p.text}; --muted: ${p.muted}; --card: ${card}; --accent: ${linkBg}; --header-bg: ${rgba(p.bg, 0.94)}; --border: ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.1)'}; --on-accent: ${p.ctaText}; }\nbody { background: var(--bg); color: var(--text); }\n.hero .lead a, .hero p a:not(.btn):not(.btn-call) { color: inherit; text-decoration: underline; }\n.btn-primary, .call-bar .cb-call { color: ${p.ctaText}; }\n`;
  const pairs = [['palette body text', p.text, p.bg], ['palette muted text', p.muted, p.bg], ['palette CTA label', p.ctaText, p.accent], ['palette link on page', linkBg, p.bg]];
  return { css, pairs, dark, primary: p.primary, accent: p.accent };
}
export const isDarkBg = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128; };
