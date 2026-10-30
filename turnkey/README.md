# Turnkey client kit

Set up a new client in 4 steps. Cost: $0 (Cloudflare free Workers + D1 + Turnstile + Access free tier).

1. **Add their files**: `my-client/assets/logo.png` and `my-client/assets/photos/*.jpg` (any size; anything over 4 MB or 2400 px wide is resized to WebP).
2. **Run the questionnaire**: copy Delivery's answers into `my-client/answers.json` using the keys in `client.config.json` (they map 1:1 to `delivery/templates/CLIENT-QUESTIONNAIRE-TEMPLATE.md`, see the table below).
3. **Run setup**: `npm ci --prefix turnkey && npx --prefix turnkey playwright install chromium`, then
   `npm run setup -- --answers my-client/answers.json --assets my-client/assets --dry-run`
4. **Done**: when it prints `RESULT: PASS`, re-run without `--dry-run` to write `clients/<slug>/` (config, `dist/`, `wrangler.jsonc`). Deploy needs William's OK (see "Deploy").

`site.size` picks the layout: `one-page` (single page with anchors) or `multi-page` (Home, Services, Our work, Contact).

## What setup checks (any failure = exit 1)
| Check | What it does |
|---|---|
| schema | Validates against `client.config.schema.json`; unknown keys are rejected |
| assets | Logo + photos found, each under 4 MB after resize; SVG logos with script are refused |
| login-safety gate | 8 checks, see below |
| placeholder scan | Fails on TODO, TBD, FIXME, lorem/ipsum, example.com, "placeholder", `___`, REPLACE, `(000) 000-0000`, `(XXX)` in the config or any public page (demo pages are excluded, they are labelled sample data) |
| header check | `_headers` has CSP (frame-ancestors 'none'), HSTS max-age=300, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, X-Robots-Tag noindex; every page has meta noindex; robots.txt Disallow / |
| link check | Every internal href/src and #anchor resolves; no http:// links |
| gitleaks | `gitleaks dir` on dist/ and the written config (redacted output) |
| overflow | Every page at 360/390/412/768/1024/1280 px has no horizontal scroll (Playwright, offline) |

## Login-safety gate (William's standing rule)
Setup and CI fail if any of these is missing or disabled:
1. Turnstile widget on every lead form (site key from `forms.turnstileSiteKey`)
2. Turnstile verified server-side, fail closed (`TURNSTILE_SECRET` Worker secret)
3. Honeypot field + server check (fake 200, nothing saved)
4. Per-IP rate limit (3/min, 10/hour, D1)
5. Owner area locked: Access JWT verified + `OWNER_EMAILS` allow-list (dupes/empties fail closed)
6. Demo dashboards `/demo/owner/` + `/demo/client/` (DEMO banner, Reset demo, noindex, no network calls; localStorage `tk-demo-v1:*`)
7. Hidden logins: `SHOW_REAL_LOGINS=false`, `SHOW_DEMO_NAV=false` (`lib/flags.mjs`), no public link to /owner or /demo
8. Forgot-password reset wherever a password login exists. The owner login is Access email code (no password), so this is N/A today; it becomes enforced the moment a password login is added (feat/forgot-login).

## Features
- **Lead form -> owner dashboard**: `POST /api/leads` (Worker + free D1, `worker/migrations/0001_leads.sql`) -> `/owner/` lists leads via `GET /api/owner/leads`.
- **Map** (optional, `location.mapAddress`): click-to-load, so nothing loads from Google until the visitor taps "Show map"; then a lazy, no-referrer iframe.
- **Chat widget** (optional, `features.chat`, off by default): local quick answers (hours, area, services, call us). No third-party script, nothing sent.
- **Payments**: `payment.link` https link -> "Pay online" button; other text -> "Pay by Zelle: <handle>"; blank -> "Payment link pending."

## Owner login setup (Cloudflare Access, one time per client, needs William's OK)
1. Zero Trust (team `green-sound-e085`) -> Access -> Applications -> Add self-hosted app `<Client> Owner (OTP)`.
   Paths: `<slug>-preview.ttawebdev.com/owner*`, `/api/owner`, `/api/owner*`.
2. Login methods: **One-time PIN** (email code). Google is optional: add it only after the Google OAuth IdP exists on the team; keep auto-redirect off.
3. Policy: Allow, Emails = `owner.loginEmail` (must be an inbox the owner controls). A second owner means editing BOTH the Access policy and `OWNER_EMAILS`.
4. Copy the app's AUD tag; it is `ACCESS_AUD` at deploy. Without it the Worker answers 403 for the owner area (fail closed).

## Deploy (never in dry-run; needs William's explicit OK)
```
wrangler d1 create <slug>-preview            # free; note the id
wrangler secret put TURNSTILE_SECRET --config clients/<slug>/wrangler.jsonc
D1_DATABASE_ID=<id> ACCESS_AUD=<aud> TURNKEY_DEPLOY_OK=yes npm run setup -- --answers ... --assets ... --deploy
wrangler d1 migrations apply <slug>-preview --remote --config clients/<slug>/wrangler.jsonc
```
`--deploy` refuses when any check failed, the Turnstile key is a Cloudflare test key, env is missing, or `TURNKEY_DEPLOY_OK` is not `yes`. Record the previous version id for rollback (`wrangler deployments list`).

## Questionnaire key map
Keys 1-18 and 19-22 match Delivery's template exactly. Proposed additions (optional, not in the questionnaire yet): `business.licenseInsured`, `brand.tagline`, `brand.primaryColor`.
