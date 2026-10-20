// VENDORED from client-site-templates/tools/industry.mjs (spec v5.1). Do not edit here; copy it over.
// Spec v5.1 trade x feature check. Source of truth: tools/industry-features.json (= specs/spec-v5-feature-matrix.json
// plus "auditMarkers"). Shared by mockup.mjs, export-client, audit-industry; vendored into multipage-template.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const MATRIX = JSON.parse(fs.readFileSync(path.join(here, 'industry-features.json'), 'utf8'));

/** Matrix entry for a trade id; unknown ids get the deny-by-default fallback. */
export function tradeRules(...ids) {
  for (const id of ids) if (id && MATRIX.trades[id]) return { id, rules: MATRIX.trades[id], unknown: false };
  return { id: ids.find(Boolean) || 'unknown', rules: MATRIX.fallback, unknown: true };
}

/** Parse --allow-feature/--allow-reason (or config). Only one id; a reason is required. */
export function parseOverride(id, reason) {
  if (!id) return null;
  const ids = String(id).split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length !== 1) throw new Error('--allow-feature takes exactly one id per build (no blanket overrides).');
  if (!reason || !String(reason).trim()) throw new Error(`--allow-feature ${ids[0]} needs --allow-reason "why this business really offers it".`);
  return { id: ids[0], reason: String(reason).trim() };
}

const LISTS = {
  money: (r) => [r.money?.allowed || [], r.money?.forbidden || []],
  feature: (r) => [r.features?.allowed || [], r.features?.forbidden || []],
  action: (r) => [[r.multipage?.action].filter(Boolean), r.multipage?.forbiddenActions || []],
  'multipage feature': (r) => [r.multipage?.allowedFeatures || [], r.multipage?.forbiddenFeatures || []],
  layout: (r) => [r.layouts?.allowed || null, r.layouts?.forbidden || r.forbiddenLayouts || []],
  hero: (r) => [r.heroes?.allowed || null, r.heroes?.forbidden || r.forbiddenHeroes || []],
};

/** items: [kind, id, source]. Returns { fails, warns }. Fallback (unknown trade) denies anything not allowed. */
export function checkTrade(t, items, override = null) {
  const fails = []; const warns = []; let used = false;
  for (const [kind, id, source] of items) {
    if (id == null || id === '' || id === 'none') continue;
    const [allowed, forbidden] = LISTS[kind](t.rules);
    const bad = forbidden.includes(id) || (t.unknown && t.rules.denyByDefault && allowed && !allowed.includes(id));
    const msg = `${kind} "${id}" (from ${source}) is not allowed for ${t.unknown ? `unknown trade "${t.id}"` : `trade "${t.id}"`}`;
    if (bad) {
      if (override && override.id === id) { warns.push(`${msg}; allowed by --allow-feature (reason: ${override.reason})`); used = true; } else fails.push(msg);
    } else if (allowed && !allowed.includes(id)) warns.push(`${kind} "${id}" (from ${source}) is not classified for trade "${t.id}" in the matrix`);
  }
  if (override && !used) warns.push(`--allow-feature ${override.id} was not needed`);
  if (t.unknown) warns.unshift(`unknown trade "${t.id}", deny-by-default rules applied`);
  return { fails, warns };
}
export function failMessage(t, fails) {
  return `Feature check failed for trade "${t.id}" (tools/industry-features.json, spec v5):\n  - ${fails.join('\n  - ')}\nNothing was written. Remove the flag, or if the business really offers it: --allow-feature <id> --allow-reason "TEXT" (one per build).`;
}

/** Scan built HTML with the v5.1 per-id auditMarkers. A marker leaks when it matches and its id is not allowed for the trade. */
const rx = (p) => { const m = /^\(\?i\)/.test(p); return new RegExp(m ? p.slice(4) : p, m ? 'i' : ''); };
export function scanHtml(html, t, allow = []) {
  const r = t.rules; const A = MATRIX.auditMarkers; const hits = [];
  const mp = r.multipage || {};
  const okFor = {
    money: new Set([...(r.money?.allowed || []), ...allow]),
    features: new Set([...(r.features?.allowed || []), ...(r.money?.allowed || []), ...allow]),
    heroes: new Set([...(r.heroes?.allowed || []), ...allow]),
    multipageActions: new Set([mp.action, ...(mp.allowedFeatures || []), ...allow].filter(Boolean)),
  };
  if (mp.action === 'book' || mp.allowedFeatures?.includes('booking')) { okFor.features.add('booking'); okFor.multipageActions.add('book'); }
  if (okFor.features.has('pickup-order') || okFor.features.has('menu')) okFor.multipageActions.add('order');
  for (const grp of Object.keys(okFor)) for (const [id, m] of Object.entries(A[grp] || {})) {
    if (id.startsWith('_') || okFor[grp].has(id)) continue;
    for (const p of m.patterns || []) { const hit = html.match(rx(p)); if (hit) { hits.push(`${grp.replace(/s$/, '')} ${id}: ${JSON.stringify(hit[0].slice(0, 60))}`); break; } }
  }
  const layout = (html.match(new RegExp(A.layouts?.pattern || '<meta name="x-layout" content="([a-z-]+)">')) || [])[1];
  if (layout && layout !== 'none' && !(r.layouts?.allowed || []).includes(layout) && !allow.includes(layout)) hits.push(`layout ${layout}: not allowed for ${t.id}`);
  return hits;
}

/** v5.1 aliases: resolve a raw --trade (or business-name slug) to a folder id per aliases.tieBreak. */
const slug = (x) => String(x || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function resolveTradeAlias(raw, { name = '' } = {}) {
  const AL = MATRIX.aliases; const key = slug(raw); const warns = [];
  const prio = (f) => AL.priority[f] ?? AL.priority.default;
  const keywordWarn = (folder) => { const n = slug(name).split('-'); for (const [tr, kws] of Object.entries(AL.keywords || {})) if (tr !== folder && kws.some((k) => n.includes(k))) warns.push(`business name suggests "${tr}" but trade resolved to "${folder}"`); };
  let folder = null;
  for (const [f, list] of Object.entries(AL.exact)) if (list.includes(key)) { folder = f; break; }
  if (!folder && AL.reusedNames[key]) folder = AL.reusedNames[key];
  if (!folder) {
    let best = null;
    for (const [f, list] of Object.entries(AL.exact)) if (!AL.exactOnly.includes(f)) for (const a of list) if (a.includes('-') && key.includes(a) && (!best || a.length > best[1].length)) best = [f, a];
    if (best) folder = best[0];
  }
  if (!folder) {
    const toks = key.split('-'); const cands = [];
    for (const [f, list] of Object.entries(AL.exact)) if (!AL.exactOnly.includes(f)) for (const a of list) if (!a.includes('-') && !AL.looseSkip.includes(a)) { const pos = toks.indexOf(a); if (pos >= 0) cands.push([f, a, pos]); }
    cands.sort((x, y) => prio(y[0]) - prio(x[0]) || y[1].length - x[1].length || x[2] - y[2]);
    if (cands.length) { folder = cands[0][0]; const tie = cands.find((c) => c[0] !== folder && prio(c[0]) === prio(folder) && c[1].length === cands[0][1].length && c[2] === cands[0][2]); if (tie) warns.push(`"${raw}" ties between ${folder} and ${tie[0]}; using ${folder}`); }
  }
  if (!folder) { warns.push(`trade "${raw}" not recognized; using generic-business (deny by default). Pass an exact --trade.`); return { folder: 'generic-business', fallback: true, warns }; }
  if (name) keywordWarn(folder);
  return { folder, fallback: false, warns };
}

const TRADE_IDS = Object.keys(MATRIX.trades).sort((a, b) => b.length - a.length);
export const TYPE_TRADE = { Restaurant: 'restaurant', FoodEstablishment: 'restaurant', HairSalon: 'salon-barber', BeautySalon: 'salon-barber', NailSalon: 'salon-barber', Dentist: 'dental-medical', MedicalClinic: 'dental-medical', AutoRepair: 'auto-repair', AutoWash: 'auto-detailing', ChildCare: 'daycare', Attorney: 'law-accounting', AccountingService: 'law-accounting', TattooParlor: 'tattoo', RealEstateAgent: 'real-estate', ExerciseGym: 'fitness', Church: 'church', Plumber: 'plumbing', HVACBusiness: 'hvac', Electrician: 'electrician', RoofingContractor: 'roofing', HousePainter: 'painting', MovingCompany: 'moving' };
/** Trade of a built page (pageTradeRecord precedence): --trade > meta x-trade > build.json > prospects manifest > folder (legacy) > JSON-LD (legacy).
 *  Returns [tradeRules, why, allowIds, problems]; problems lists conflicts between present sources (FAIL) and missing records. */
export function tradeOfFile(file, trade = null) {
  const html = fs.readFileSync(file, 'utf8'); const src = [];
  if (trade) src.push([trade, `--trade ${trade}`, []]);
  const meta = (html.match(/<meta name="x-trade" content="([a-z-]+)">/) || [])[1];
  if (meta) src.push([meta, `meta x-trade ${meta}`, []]);
  let d = path.dirname(file);
  for (let i = 0; i < 4 && d.length > 1; i++, d = path.dirname(d)) {
    const bj = path.join(d, 'build.json');
    if (fs.existsSync(bj)) { try { const j = JSON.parse(fs.readFileSync(bj, 'utf8')); if (j.trade) { src.push([j.trade, `build.json trade ${j.trade}`, j.allowFeature ? [j.allowFeature] : []]); break; } } catch {} }
  }
  const man = path.join(path.dirname(path.dirname(file)), 'manifest.json');
  if (fs.existsSync(man)) { try { const e = JSON.parse(fs.readFileSync(man, 'utf8'))[path.basename(path.dirname(file))]; const t = typeof e === 'string' ? e : e?.trade; if (t) src.push([t, `manifest ${t}`, []]); } catch {} }
  const problems = [];
  const ids = [...new Set(src.map((x) => x[0]))];
  if (ids.length > 1) problems.push(`trade record conflict: ${src.map((x) => x[1]).join(' vs ')}`);
  if (src.length) return [tradeRules(src[0][0]), src[0][1], src.flatMap((x) => x[2]), problems];
  problems.push('no trade record (x-trade meta / build.json / manifest)');
  const dir = path.basename(path.dirname(file)).replace(/^design-/, '');
  const t = TRADE_IDS.find((k) => dir === k || dir.startsWith(k + '-'));
  if (t) return [tradeRules(t), `folder ${t} (legacy)`, [], problems];
  const ty = (html.match(/"@type":"([A-Za-z]+)"/) || [])[1];
  if (ty && TYPE_TRADE[ty]) return [tradeRules(TYPE_TRADE[ty]), `schema ${ty} (legacy)`, [], problems];
  return [tradeRules('generic-business'), 'unknown (generic-business)', [], problems];
}
