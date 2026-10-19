// Spec v5 trade x feature check. Source of truth: tools/industry-features.json (= specs/spec-v5-feature-matrix.json
// Vendored from trae77/client-site-templates tools/industry.mjs (source of truth: tools/industry-features.json = spec v5 matrix). Keep in sync.
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
  layout: (r) => [null, r.forbiddenLayouts || []],
  hero: (r) => [null, r.forbiddenHeroes || []],
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

/** Scan built HTML for audit markers whose ids are not allowed for the trade. */
export function scanHtml(html, t, allow = []) {
  const ok = new Set([...(t.rules.money?.allowed || []), ...(t.rules.features?.allowed || []), ...allow]);
  if (t.rules.multipage?.allowedFeatures?.includes('booking') || t.rules.multipage?.action === 'book') ok.add('booking');
  const hits = [];
  for (const [what, m] of Object.entries(MATRIX.auditMarkers)) {
    if (what.startsWith('_') || m.ids.some((i) => ok.has(i))) continue;
    for (const p of m.patterns) { const r = html.match(new RegExp(p)); if (r) { hits.push(`${what}: ${JSON.stringify(r[0].slice(0, 60))}`); break; } }
  }
  return hits;
}

const TRADE_IDS = Object.keys(MATRIX.trades).sort((a, b) => b.length - a.length);
export const TYPE_TRADE = { Restaurant: 'restaurant', FoodEstablishment: 'restaurant', HairSalon: 'salon-barber', BeautySalon: 'salon-barber', NailSalon: 'salon-barber', Dentist: 'dental-medical', MedicalClinic: 'dental-medical', AutoRepair: 'auto-repair', AutoWash: 'auto-detailing', ChildCare: 'daycare', Attorney: 'law-accounting', AccountingService: 'law-accounting', TattooParlor: 'tattoo', RealEstateAgent: 'real-estate', ExerciseGym: 'fitness', Church: 'church', Plumber: 'plumbing', HVACBusiness: 'hvac', Electrician: 'electrician', RoofingContractor: 'roofing', HousePainter: 'painting', MovingCompany: 'moving' };
/** Trade of a built page: x-trade meta, build.json {trade, allowFeature}, folder name, JSON-LD @type. */
export function tradeOfFile(file, trade = null) {
  if (trade) return [tradeRules(trade), `--trade ${trade}`, []];
  const html = fs.readFileSync(file, 'utf8');
  const meta = (html.match(/<meta name="x-trade" content="([^"]+)"/) || [])[1];
  if (meta) return [tradeRules(meta), `meta x-trade ${meta}`, []];
  let d = path.dirname(file);
  for (let i = 0; i < 4 && d.length > 1; i++, d = path.dirname(d)) {
    const bj = path.join(d, 'build.json');
    if (fs.existsSync(bj)) { try { const j = JSON.parse(fs.readFileSync(bj, 'utf8')); if (j.trade) return [tradeRules(j.trade), `build.json trade ${j.trade}`, j.allowFeature ? [j.allowFeature] : []]; } catch {} }
  }
  const dir = path.basename(path.dirname(file)).replace(/^design-/, '');
  const t = TRADE_IDS.find((k) => dir === k || dir.startsWith(k + '-'));
  if (t) return [tradeRules(t), `folder ${t}`, []];
  const ty = (html.match(/"@type":"([A-Za-z]+)"/) || [])[1];
  if (ty && TYPE_TRADE[ty]) return [tradeRules(TYPE_TRADE[ty]), `schema ${ty}`, []];
  return [tradeRules('generic-business'), 'unknown (generic-business)', []];
}
