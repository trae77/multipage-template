// Tiny JSON-Schema subset validator (zero deps). Unknown keys are rejected so answers stay 1:1 with the questionnaire.
const EMAIL = /^[^\s@<>"(),;:\\[\]]+@[^\s@<>"(),;:\\[\]]+\.[^\s@<>"(),;:\\[\]]{2,}$/;
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' ? 'number' : typeof v);
export function validate(schema, value, path = '', errs = []) {
  const types = schema.type ? [].concat(schema.type) : null;
  if (types && !types.includes(typeOf(value))) { errs.push(`${path || '(root)'}: expected ${types.join('|')}`); return errs; }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.trim().length < schema.minLength) errs.push(`${path}: too short`);
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path}: too long (max ${schema.maxLength})`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: bad format`);
    if (schema.format === 'email' && !EMAIL.test(value)) errs.push(`${path}: not an email`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path}: needs at least ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path}: max ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, errs));
  }
  if (typeOf(value) === 'object' && schema.properties) {
    for (const r of schema.required || []) if (!(r in value)) errs.push(`${path ? path + '.' : ''}${r}: required`);
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties[k];
      if (!sub) { errs.push(`${path ? path + '.' : ''}${k}: unknown key`); continue; }
      validate(sub, v, path ? `${path}.${k}` : k, errs);
    }
  }
  return errs;
}
// Flat list of questionnaire keys (x-q) and proposed keys (x-proposed), for docs/tests.
export function keyMap(schema, prefix = '', out = { q: [], proposed: [] }) {
  for (const [k, s] of Object.entries(schema.properties || {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (s['x-q']) out.q.push([s['x-q'], p]);
    if (s['x-proposed']) out.proposed.push(p);
    if (s.properties) keyMap(s, p, out);
  }
  out.q.sort((a, b) => a[0] - b[0]);
  return out;
}

// Config-level rules the tiny validator can't express. forms.notifyEmail (Q16 email): validated by the schema (format email),
// REQUIRED when forms.destination = owner-dashboard+email, optional (must be blank) for owner-dashboard. Brand.logo must be a filename or N.
export function validateConfig(schema, cfg) {
  const errs = validate(schema, cfg);
  const ne = String(cfg?.forms?.notifyEmail || '').trim();
  if (cfg?.forms?.destination === 'owner-dashboard+email' && !ne) errs.push('forms.notifyEmail: required when forms.destination is owner-dashboard+email (Q16 email address)');
  if (ne && !EMAIL.test(ne)) errs.push('forms.notifyEmail: not an email');
  if (cfg?.forms?.destination === 'owner-dashboard' && ne) errs.push('forms.notifyEmail: set but forms.destination is owner-dashboard (use owner-dashboard+email to send lead copies)');
  if (/^(y(es)?\b|https?:)/i.test(String(cfg?.brand?.logo || '').trim())) errs.push('brand.logo: put the logo FILENAME from --assets (or N). For "Y + link", download the file into --assets first.');
  return errs;
}
