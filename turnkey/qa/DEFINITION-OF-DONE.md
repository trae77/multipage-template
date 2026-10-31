# TTA Definition of Done (mandatory baseline) — v1, 2026-10-30
Applies to EVERY client site, template (client-site-templates, multipage-template, turnkey) and preview.
Nothing is "done", "QA PASS", or "ready for William" unless every applicable box is checked with proof
(URL + command output / screenshot path). "N/A" needs a one-line reason. Gate: `ops/standards/qa-gate.sh`.

## A. Auth (any site with a login)
- [ ] A1 Customer signup + login + logout work on the deployed preview
- [ ] A2 (L1) Account recovery, BOTH required: (a) real reset email via Resend (free tier) delivered to tta.dev.web+qatest@gmail.com with a single-use link that expires (<=60 min), rate-limited, generic "if that email exists" reply, Resend key only as an env secret (never in code/logs/errors/client bundle); real-email part is BLOCKED (not a code FAIL) until Resend is wired+deployed if the send path is implemented behind the key; AND (b) owner re-invite fallback: owner can re-send a single-use invite (48h), reused or expired invite links fail. [source: CEO relay 5:28 PM via Manager (correction)]
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
- [ ] D3 Client previews: main menu shows BOTH "Owner demo" and "Client demo" links at 1280, 768 and 390 (mobile menu opened); rendered check, qa-gate.sh demo-nav-render.mjs [source: CEO relay 2026-10-30 via Manager]
- [ ] D4 No href anywhere on the site points at the real /owner/ path (demo paths fine); rendered same-origin crawl [source: CEO relay 2026-10-30 via Manager]
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


## Client questionnaire (added 2026-10-30)
- [ ] Questionnaire is a clickable Google Form, not a Doc: tap-to-answer, mobile-friendly, no sign-in, no legal section, no secrets asked, owner-login email field, responses to a private tta.dev.web Sheet, tested from an outside account. QA FAILS a Doc-only questionnaire.
- [ ] Easiest-answer rules met: easiest option listed first on every question, "not sure, you pick" / "skip, ask me later" offered, files sent by text/email/share link (no upload), only login email required, under 10 minutes on a phone. QA FAILS a form that requires typing what could be a tap.

## Preview demo links (William, relayed by CEO 2026-10-30 5:35 PM)
"always add them for previews. We want the clients to preview everything" -- Every client preview site shows Owner demo and Client demo links in its main menu by default. The real /owner/ stays Access-locked and out of the menu. QA FAILs any preview missing either demo link or exposing /owner/ in the menu.

## Parallel multi-client delivery (STANDING)
"we want to be able to complete multiple clients at once quickly and efficiently" / "make this standing rule" (William, via CEO, 2026-10-30 5:56 PM). Also: "get everyone on it" / "always do this" (5:54 PM).
- Run multiple clients at once in parallel lanes built from shared templates and reusable feature modules (model: /workspace/utime-build/CONTRACT.md plug-in contract).
- Every build is split across all capable bots at once; fastest clickable demo first, then polish.
- Every client fix is upstreamed to the templates (see UPSTREAM-RULE.md).
- All holds, security rules and the qa-gate.sh PASS still apply per PR.
