# DoD evidence: turnkey kit (TEMPLATE, test client "Acme Test Co", local preview via real Worker)
Scope: template-level proof. Every real client must re-do A6, C1, C2, E1, G1, H1, H2 on its deployed preview (setup without --dry-run requires its own EVIDENCE.md).
A1: N/A no customer signup/login in the turnkey kit (owner-only via Cloudflare Access); client accounts arrive with feat/forgot-login
A2: N/A no password login exists (Access email code), nothing to reset; lib/gate.mjs check 8 fails the build if a password login appears without a reset flow
A3: PASS per-IP D1 rate limit 3/min 10/h on /api/leads; tests/worker.test.mjs "rate limit: 4th request in a minute is 429"
A4: PASS Turnstile on the only public form, fail closed server-side; tests/worker.test.mjs "Turnstile fails closed"; gate checks 1-2
A6: N/A template has no deployment; required per client (real emailed code -> /owner/) before handoff, enforced by setup without --dry-run
A7: N/A owner link documented in README "Owner login setup" (SHOW_REAL_LOGINS=false hides it); per-client handoff doc lists it
C1: PASS tests/worker.test.mjs "valid lead is saved and shows in owner list query" (POST /api/leads -> D1 -> GET /api/owner/leads query)
C2: PASS sendLeadEmail via free Email Routing binding LEAD_EMAIL (opt-in vars LEAD_NOTIFY_EMAIL/LEAD_FROM_EMAIL); per-client live proof required
D1: PASS /demo/owner/ + /demo/client/: DEMO banner, Reset demo, noindex, localStorage only; gate check 6; screenshots /workspace/qa/turnkey-2026-10-30/shot-*_demo_*.png
E1: PASS overflow check 8 widths (360-1440) 0 overflow; screenshots /workspace/qa/turnkey-2026-10-30/shot-{390,820,1440}_*.png
E2: PASS link check (all hrefs/anchors resolve, tel:+1 from contact.phone, mailto from contact.email, click-to-load map) + placeholder scan PASS
G1: N/A static site + D1; per client: D1 Time Travel (free, 30-day restore) + restore test recorded at deploy
H1: N/A template; per-client handoff doc (delivery/templates) lists live URL, owner login, support contact
H2: N/A template; welcome email drafted per client by Delivery
U1: PASS Template PR: this PR is the template (turnkey kit) itself
