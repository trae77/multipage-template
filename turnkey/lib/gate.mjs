// Login-safety gate (William's standing rule, Oct 30): any template with logins must ship with ALL of these on.
// Used by setup.mjs (against the built dist) and by CI (`npm run gate`, against the kit source + an Acme build).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as flags from './flags.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);

export function loginGate(dist) {
  const w = read(path.join(KIT, 'worker/index.mjs'));
  const html = walk(dist).filter((f) => f.endsWith('.html'));
  const rel = (f) => path.relative(dist, f).split(path.sep).join('/');
  const pub = html.filter((f) => !/^(demo|owner)\//.test(rel(f)));
  const pubText = pub.map(read).join('\n');
  const all = [...html.map(read), w].join('\n');
  const passwordLogin = /type="password"|\/api\/(login|signup|password)/i.test(all);
  const forgot = html.some((f) => /^forgot/.test(rel(f))) || /\/api\/(forgot|reset)/.test(w);
  const demoOk = (k) => { const s = read(path.join(dist, `demo/${k}/index.html`)); return /noindex/.test(s) && /demo-reset/.test(s) && /DEMO - sample data/.test(s); };
  const demoJs = read(path.join(dist, 'demo/demo.js'));
  const checks = [
    ['forms: Turnstile widget on every lead form', /id="lead-form"/.test(pubText) && pub.filter((f) => /id="lead-form"/.test(read(f))).every((f) => /class="cf-turnstile" data-sitekey="[^"]{10,}"/.test(read(f)))],
    ['forms: Turnstile verified server-side, fail closed', /if \(!env\.TURNSTILE_SECRET[^\n]*return false/.test(w) && /turnstileOk\(env, body/.test(w)],
    ['forms: honeypot field + server check', /name="website" tabindex="-1"/.test(pubText) && /body\.website\) return json\(\{ ok: true \}\)/.test(w)],
    ['forms: per-IP rate limit', /await rateLimited\(env\.DB, ip\)/.test(w) && /perMinute: \d+, perHour: \d+/.test(w)],
    ['owner login: Access JWT verified + OWNER_EMAILS allow-list', /verifyAccessJwt\(req\.headers\.get\('Cf-Access-Jwt-Assertion'\)/.test(w) && /ownerAllowed\(id, env\)/.test(w) && /isProtected\(norm\)/.test(w) && fs.existsSync(path.join(dist, 'owner/index.html'))],
    ['demo dashboards: /demo/owner/ + /demo/client/ (banner, Reset, noindex, no network)', demoOk('owner') && demoOk('client') && demoJs && !/fetch\(|XMLHttpRequest|sendBeacon/.test(demoJs)],
    ['hidden real login + preview demo menu: SHOW_REAL_LOGINS=false, no public link to /owner; SHOW_DEMO_NAV=true and every public page main menu has Owner demo + Client demo', flags.SHOW_REAL_LOGINS === false && flags.SHOW_DEMO_NAV === true && !/href="\/owner\b/.test(pubText)
      && pub.length > 0 && pub.every((f) => { const n = (read(f).match(/<nav aria-label="Main">([\s\S]*?)<\/nav>/) || [])[1] || ''; return /href="\/demo\/owner\/">Owner demo</.test(n) && /href="\/demo\/client\/">Client demo</.test(n); })],
    ['forgot-password reset present wherever a password login exists', !passwordLogin || forgot],
  ];
  const errs = checks.filter(([, ok]) => !ok).map(([n]) => n);
  const notes = passwordLogin ? [] : ['no password login in this build (owner = Access email code), so forgot-password is N/A until feat/forgot-login merges; gate enforces it as soon as any password login appears'];
  return { checks, errs, notes };
}
