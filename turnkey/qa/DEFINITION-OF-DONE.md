# TTA Definition of Done (mandatory baseline) — v1, 2026-10-30
Applies to EVERY client site, template (client-site-templates, multipage-template, turnkey) and preview.
Nothing is "done", "QA PASS", or "ready for William" unless every applicable box is checked with proof
(URL + command output / screenshot path). "N/A" needs a one-line reason. Gate: `ops/standards/qa-gate.sh`.

## A. Auth (any site with a login)
- [ ] A1 Customer signup + login + logout work on the deployed preview
- [ ] A2 Forgot-password: emailed single-use reset link, expires <=60 min, rate-limited, generic "if that email exists" reply
- [ ] A3 Rate limit / lockout on login, signup, reset, invite
- [ ] A4 Turnstile on signup, login-after-failures, reset, every public form
- [ ] A5 Owner area behind Cloudflare Access (allowlist = real owner emails) AND worker allowlist agrees with Access policy
- [ ] A6 REAL-LOGIN E2E: a human (or browser agent) signs in through Access with a real emailed code and reaches /owner/ (not 403). Unit tests with mocked identities do NOT count.
- [ ] A7 Login links reachable: either a visible "Client login" link OR the link is in the handoff doc (section H)
## B. Security
- [ ] B1 Headers: HSTS, CSP, X-Content-Type-Options, Referrer-Policy, frame-ancestors/X-Frame-Options
- [ ] B2 /.env, /admin, /.git, /wp-admin -> 404; no secrets in repo/bundle (gitleaks or rg scan)
- [ ] B3 Rollback version recorded in deploy record
## C. Forms & leads
- [ ] C1 Every form submits for real (TEST lead) and the lead appears in the owner dashboard
- [ ] C2 Owner notified (email) of new lead
## D. Demo
- [ ] D1 Owner + client demo dashboards with sample data only, reset button, noindex
- [ ] D2 No owner/admin demo or tool linked from public customer-facing menus
## E. Responsive & content
- [ ] E1 Phone (~390), tablet (~820), desktop (1440) screenshots, no overflow
- [ ] E2 tel:/mailto/links/NAP/map correct; no placeholder/lorem/fake reviews
## F. SEO
- [ ] F1 Preview: noindex + robots disallow. Live: index on, sitemap, titles/meta, GBP link
## G. Ops
- [ ] G1 Backups configured and restore tested once; G2 uptime check
## H. Handoff
- [ ] H1 Handoff doc lists: live URL, owner login link + how codes work, client login link, support contact, bookmark tip
- [ ] H2 Welcome email draft ready; H3 1-week follow-up scheduled; H4 forgot-login path documented
## U. Upstream rule (see UPSTREAM-RULE.md)
- [ ] U1 Any fix/feature on a client site has a matching template PR linked in the SAME task (or "client-specific: reason")
