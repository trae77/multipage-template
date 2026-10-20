# Client onboarding checklist: AI lead responder + review requests

Production code: [`../worker/`](../worker/). Everything ships with `DRY_RUN=true`; nothing is sent until a client is fully set up and `DRY_RUN` is changed to `false`.

## 1. What we need from the client
- [ ] Legal business name, and EIN (needed for Low-Volume Standard / Standard A2P registration; sole props without an EIN use the Sole Proprietor brand)
- [ ] Business address, website URL, public contact email and phone
- [ ] Business hours and the list of services (used in replies; no prices are quoted)
- [ ] Owner's cell and email for lead alerts, and a written OK that the owner gets alert texts/emails
- [ ] Google review link (Google Business Profile → "Ask for reviews")
- [ ] Customer list for review requests (name + email, phone optional). Every customer on it gets the same request; no filtering by satisfaction and no rewards
- [ ] Optional SMS consent checkbox added to their site form (never pre-checked), with the consent wording saved
- [ ] Email sending domain access (DNS) so we can verify DKIM/SPF for Resend
- [ ] For SMS: sample messages and opt-in description for the A2P campaign (we write these; the client confirms)

## 2. A2P 10DLC (needed before ANY text goes out on a 10-digit number)
Steps (in Twilio Console → Messaging → Regulatory Compliance):
1. Create a Customer Profile in Trust Hub for the client.
2. Register a Brand (Sole Proprietor, Low-Volume Standard, or Standard).
3. Register a Campaign (use case, sample messages, opt-in flow, STOP/HELP text).
4. Buy a local number and add it to the Campaign's Messaging Service.
5. After approval: set `compliance.a10dlc_approved=true` in the client config. Then William confirms and we set `owner_approved=true`. Only with **both** does any SMS path open (`missed_call_sms`, `sms_reply`, `review_sms`, `owner_alert_sms`).

Fees (one-time unless noted):

| Item | Cost | Source |
|---|---|---|
| Brand registration | $4.50 one-time | [Twilio: A2P 10DLC Brand Registration](https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand) |
| Standard Brand secondary vetting | $41.50 one-time (Standard only) | same Twilio page |
| Brand appeal (Standard vetting rejection) | $11 per request | same Twilio page |
| Campaign vetting | $15 one-time, non-refundable; charged once per campaign (edit and resubmit instead of deleting) | [Salesmate (Twilio reseller) FAQ](https://support.salesmate.io/hc/en-us/articles/56399492901913-A2P-10DLC-Campaign-Vetting-Overview-FAQ), [Twilio: rectifying campaigns](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/troubleshooting-a2p-brands/troubleshooting-and-rectifying-a2p-campaigns-1) |
| Monthly campaign fee | Sole Prop $2/mo; Low-Volume Mixed $1.50/mo; Standard use cases up to $10/mo | [Salesmate comparison](https://support.salesmate.io/hc/en-us/articles/22587396525209-Comparison-between-Starter-Low-Volume-Standard-and-Standard-registration-for-A2P-10DLC); Twilio's own fee article ([help.twilio.com](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service-)) did not load for us, so double-check there |

Timeline: campaign review typically **10–15 business days**, longer under backlog ([Salesmate FAQ](https://support.salesmate.io/hc/en-us/articles/56399492901913-A2P-10DLC-Campaign-Vetting-Overview-FAQ)). Texts cannot be sent before approval.

## 3. Estimated cost per client per month
Prices from [Twilio US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us) (as of Oct 2026), [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Resend pricing](https://resend.com/pricing).

| Item | Cost |
|---|---|
| Twilio local number | $1.15/mo |
| A2P campaign fee | $1.50–$10/mo (Low-Volume Mixed is $1.50) |
| SMS | $0.0083/segment + carrier fee $0.0035–$0.005 (AT&T $0.0035, T-Mobile $0.0045, Verizon $0.005) ≈ **$0.012–$0.013/segment**; inbound also billed; failed msg $0.001 |
| e.g. 300 segments/mo | ≈ $3.60–$4.00 |
| Hosting (Cloudflare Workers + D1) | $0 on Free (100k requests/day, D1 5 GB); $5/mo per *account* on Paid if ever needed (shared by all clients) |
| Email (Resend) | $0 on Free (3,000/mo, 100/day, shared by all clients); $20/mo Pro for 50k when needed (shared) |
| LLM replies | depends on provider/model; not estimated. Template fallback costs $0 |

**Typical SMS-enabled client: about $6–$7/mo** (number $1.15 + campaign $1.50 + ~300 segments ≈ $3.80), plus one-time $19.50 (brand $4.50 + vetting $15), or $61 for a Standard brand. **Email-only client: ~$0** until shared free tiers are outgrown.

## 4. Accounts William must sign up for himself
None of these were created by us. Free tiers are enough for testing:
1. **Cloudflare** (free account) – hosts the Worker + D1. Then: `npx wrangler login`, `wrangler d1 create lead-responder`, `wrangler d1 execute lead-responder --file=worker/schema.sql`, `wrangler deploy`.
2. **Twilio** – needs a payment method to leave trial and to register A2P brands/campaigns and buy numbers. Trial is fine for test sends to verified numbers only.
3. **Resend** (free) – verify the sending domain (DNS records) and create an API key.
4. **LLM API key** (optional, e.g. OpenAI or any OpenAI-compatible provider). Without it the template reply is used.

## 5. Go-live checklist per client
- [ ] Client JSON added to the `CLIENTS` secret; `npm test` passes
- [ ] Site form posts to `https://<worker>/c/<client-id>/lead`
- [ ] Twilio number webhooks: SMS → `/c/<id>/twilio/sms`, call status/no-answer → `/c/<id>/twilio/voice`
- [ ] Dry-run test lead checked in the `log` table
- [ ] William OKs switching `DRY_RUN` to `false`
- [ ] SMS stays off until `a10dlc_approved` and `owner_approved` are both true
