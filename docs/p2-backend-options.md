# P2 design note: hosted backend options (not built)

Spec v2 P2 suggests moving the portal and dashboard to Supabase (with Cloudflare Workers for email and webhooks).
Each option needs an account that William or the client would have to create, so none of it is built. This note records the trade-offs.

## What exists today
- **Static (GitHub Pages):** all public pages and every main-action page (quote, book, order + menu, schedule, listings, packages), gallery and blog. In the demo, forms save to `localStorage`.
- **Node + SQLite (`server/`, Render via `render.yaml`):** auth, portal, dashboard, uploads, notifications. This is the bigfootConstruction pattern. It needs a paid instance ($7/mo) and a disk, because the free plan wipes files.

## Option A: Supabase as the data layer (spec recommendation)
- Replace `ApiStore` in `src/public/app.js` with a `SupabaseStore` that has the same methods. The UI already talks to a store interface (DemoStore and ApiStore), so pages don't change.
- Tables mirror `server/db.js`. Security moves into Row-Level Security policies: customers see rows where `customer_id = auth.uid()`, and the owner role sees everything. The service-role key never ships to the browser.
- Login: magic-link email (`signInWithOtp`) instead of passwords. Add the client's own SMTP before launch because the built-in sender is rate-limited.
- Photos go to Supabase Storage with private buckets and signed URLs.
- Caveat from the spec (not re-checked here): free projects pause after a week of low activity. Plan on a scheduled keep-alive, or move to the paid tier for a real client.
- **Needs:** a Supabase account and project per client, plus SMTP credentials.

## Option B: Cloudflare Pages Functions + D1
- Port `server/app.js` routes to Workers (D1 is SQLite, so the schema carries over). Photos go to R2.
- Good for webhooks (Square or Stripe) and sending email without exposing secrets.
- **Needs:** a Cloudflare account. The domain plan already uses Cloudflare (Big Foot STEPS.md), so this may reuse one.

## Option C: keep Node + SQLite on Render (current)
- Already built and tested. It costs about $7/mo plus the domain and holds no third-party data.

## Not on any option
- **Medical/dental:** no portal (`presets/industries.json` → `portalOff`). Link to the practice's own patient portal (`business.patientPortalUrl`). Free tiers don't come with a HIPAA BAA.
- **Payments:** only a Stripe Payment Link or Square link supplied by the client. No card data is handled by the site.

## Recommendation
Stay on Option C for the first paying client. Revisit A or B only if William wants $0 hosting and accepts a sign-up per client.
