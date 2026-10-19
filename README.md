# Multi-page small-business site template

Reusable template for the multi-page + login tier: public pages, customer portal and owner dashboard,
driven by one `site.config.json`. Styling uses the same `--theme` names as
`trae77/client-site-templates` (`tools/library.mjs`), so a one-pager mockup and its multi-page upgrade match.

Two builds from the same source:

| Build | Command | Runs on | Data |
|---|---|---|---|
| **Server** | `npm run build && npm start` | Node host (Render) | SQLite + uploads in `DATA_DIR` |
| **Static demo** | `npm run build:demo` → `dist-demo/` | GitHub Pages / any static host | Mock data in the browser's `localStorage` |

The demo shows a **"Demo mode, sample data"** banner on every page, the demo logins on the login page, and a
"Reset demo data" button in both dashboards. All demo content is tagged **Sample**.

## Quick start

```bash
npm install
npm run dev              # builds dist/, starts http://localhost:3000 with owner@demo.test / demo-owner + sample data
npm run build:demo       # static demo in dist-demo/ (open via any static server)
npm test                 # API tests (node:test)
npm run test:e2e         # builds the demo + Playwright smoke test at 390px and 1440px
npm run screenshots      # /workspace/mockups/mp-*.png (or MOCKUP_DIR=...)
```

Demo logins (static demo, and `npm run dev`): owner `owner@demo.test` / `demo-owner`, customer `customer@demo.test` / `demo-customer`.

## Configure a client site

Edit `site.config.json`:

- `business`: name, tagline, phone, email, address, city/region/postalCode, `serviceAreas`, `mapQuery`, `hours` (blank = hidden), `about` (markdown).
- `trade`: one of the presets in `presets/trades.json` (sets label, default theme, colors and services).
- `theme`: blank = trade default, or one of `bold-industrial`, `clean-minimal`, `warm-local`, `coastal-fresh`, `earthy-organic`, `modern-bold-color`, `premium-dark`.
- `colors`: `{ "primary": "#…", "accent": "#…" }` to override the trade colors. Text-on-color and link colors are picked automatically for WCAG AA contrast.
- `services`: blank = trade preset. Each entry `{ name, summary, body? }`; `body` (markdown) fills that service's detail page.
- `features`: toggle `gallery`, `beforeAfter`, `reviews`, `serviceArea`, `faq`, `blog`, `quoteForm`, `booking`, `portal`, `admin`, `callBar`, `payInvoice`.
- `booking`: `slotMinutes`, `dayStart`, `dayEnd`, `days` (0 = Sun), `leadDays`, `windowDays`.
- `payments.stripePaymentLink`: leave blank and the customer's **Pay invoice** button stays disabled. Only `https://buy.stripe.com/…` or `https://checkout.stripe.com/…` links are accepted.
- `analytics`: `{ "provider": "plausible" | "ga4" | "none", "id": "…" }`. Off by default and never loaded in the demo build.
- `siteUrl`: used for canonical URLs, sitemap.xml and robots.txt.

Content (`content/sample.json`): sample projects, reviews, FAQ and blog posts. **Replace it with real content before launch.**
Reviews only come from this file. Nothing is generated. After launch, the owner adds gallery projects, posts and home/about text from the dashboard.

CLI overrides: `node tools/build.mjs [--demo] --trade hvac --theme premium-dark --config other.json --content other.json --out dir --site-url https://…`

Re-sync presets/themes from client-site-templates: `npm run presets -- /path/to/client-site-templates`.

There are 28 trade presets: the 20 library categories plus the original one-pager trades (pressure-washing, landscaping, plumbing, cleaning-service, restaurant, auto-detailing, handyman, generic-business).

## Pages

Home · Services + one detail page per service · About · Projects (before/after slider) · Reviews · Service Area (list + map) · FAQ (with FAQPage JSON-LD) ·
Blog (posts from `content/*.json`, plus dashboard posts) · Contact/Quote form · Book · Log in · Customer portal · Owner dashboard.

## Features: STATIC vs NEEDS BACKEND

"STATIC" = works on GitHub Pages with no server. In the demo build, everything marked "NEEDS BACKEND" still works for click-through, but only against `localStorage` in that one browser.

| Feature | Status | Notes |
|---|---|---|
| All public pages, per-service detail pages | STATIC | Generated HTML |
| Themes (7) + trade presets (28) | STATIC | Same names as client-site-templates |
| Before/after slider, gallery | STATIC | Keyboard accessible range input |
| Reviews from data only | STATIC | From `content/*.json` |
| Service area list + map embed | STATIC | Google Maps embed by `mapQuery` |
| FAQ, Blog from JSON/markdown | STATIC | Simple, HTML-escaped markdown |
| SEO: per-page title/description/canonical/OG, sitemap.xml, robots.txt, LocalBusiness + FAQPage JSON-LD | STATIC | Demo build is `noindex` |
| Analytics hook (Plausible / GA4) | STATIC | Off by default |
| Sticky click-to-call bar (mobile) | STATIC | |
| Accessibility: skip link, labels, focus rings, AA contrast colors, aria tabs, reduced motion | STATIC | |
| Contact / quote request form → leads inbox | NEEDS BACKEND | `POST /api/leads`, honeypot + rate limit |
| Online booking with open slots, no double-booking | NEEDS BACKEND | Slot rules shared client/server (`src/public/slots.js`) |
| Customer login, sessions, roles (owner / customer) | NEEDS BACKEND | bcrypt hashes, 14-day bearer tokens |
| Customer: view quotes, accept/decline | NEEDS BACKEND | Drafts hidden from customers |
| Customer: invoices + Pay invoice button | NEEDS BACKEND (pay = placeholder) | Button disabled unless a Stripe Payment Link is set. No Stripe API calls |
| Customer: project status + progress | NEEDS BACKEND | |
| Customer/owner: photo uploads per project | NEEDS BACKEND | Images only, 10 MB, private (owner + that customer) |
| Messages between customer and owner | NEEDS BACKEND | |
| Owner: leads inbox with status | NEEDS BACKEND | |
| Owner: estimate/quote builder (line items, totals) | NEEDS BACKEND | Quote → invoice in one click |
| Owner: manage bookings (confirm/cancel) | NEEDS BACKEND | |
| Owner: customers (create logins) | NEEDS BACKEND | |
| Owner: edit home headline/intro and About text | NEEDS BACKEND | Public pages hydrate from `/api/content` |
| Owner: add gallery projects (with photos) and blog posts | NEEDS BACKEND | Dashboard posts render at `/blog/post/?slug=…` |
| Email / text notifications | NEEDS BACKEND + provider | Resend or SMTP, Twilio. Off unless env vars set (`server/notify.js`) |

## Deploy (Render, same pattern as bigfootConstruction)

1. Push this folder to a **private** GitHub repo.
2. Render → New → Blueprint → pick the repo. `render.yaml` creates one Node web service ($7/mo plan) with a 1 GB disk at `/var/data` (`DATA_DIR`).
3. In the Render dashboard set `OWNER_EMAIL` and `OWNER_PASSWORD` (and optional notification vars, see `.env.example`). Set `siteUrl` in `site.config.json` to the final domain.
4. Custom domain: add it in Render, then CNAME the root and `www` to `<service>.onrender.com` at your DNS host.
5. Log in at `/login/` as the owner, create customer logins under **Customers**.

Static demo on GitHub Pages: `npm run build:demo` and publish `dist-demo/` (it includes `.nojekyll`; links are relative so any sub-path works).

## Layout

```
site.config.json         business info, trade, theme, features
presets/                 trades.json + themes.json (generated by tools/make-presets.mjs)
content/sample.json      SAMPLE projects, reviews, FAQ, posts
tools/build.mjs          static page generator (server + demo builds)
src/public/              base.css, app.js (UI + ApiStore/DemoStore), slots.js, md.js
server/                  app.js (Express API), db.js (SQLite schema), notify.js, index.js
tests/                   api.test.js, smoke.mjs (Playwright), screenshots.mjs
```

## Not included yet / stubbed

- Real payments (Stripe Payment Link button only, disabled by default). No webhooks, so invoices are marked paid by hand.
- Password reset, customer self-signup, and 2FA. The owner creates customer logins.
- Calendar sync (Google/Calendly) for bookings.
- Notification sending is untested against live providers (only the hook is tested).
- Editing service pages, FAQ and reviews from the dashboard. These live in config/content files and need a rebuild.
- SMTP needs `npm i nodemailer`.
