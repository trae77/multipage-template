# Lead responder: production Worker

Production version of the n8n demo. **Host: Cloudflare Workers + D1.**
Why: the free plan (100k requests/day, D1 5 GB) covers many small clients at $0. There's no server to patch, and it runs on the same Cloudflare account we already use for client sites. Self-hosted n8n needs an always-on VM (~$5+/mo) plus upkeep. The n8n workflow in `../n8n/` stays as the demo.

- `src/config.js`: per-client config and the **A2P hard gate** (`a10dlc_approved && owner_approved`)
- `src/providers.js`: common `send()` interface; `TwilioSms`, `ResendEmail`, `MockProvider`; **DRY_RUN on unless `DRY_RUN=false`**
- `src/core.js`: leads, missed calls (text-back off by default, never treated as consent), STOP/START/HELP + suppression
- `src/reviews.js`: review requests to every customer, no gating, no incentives, opt-outs honored, SMS behind the gate
- `src/llm.js`: same LLM step as the demo with template fallback
- `src/store.js`: D1 store (consent, suppression, log) and an in-memory store
- `schema.sql`, `wrangler.toml.example`, `clients/example.json`

Run tests (Node 20+, no installs): `cd lead-responder/worker && npm test`

Onboarding, A2P fees and costs: [`../docs/ONBOARDING.md`](../docs/ONBOARDING.md).
