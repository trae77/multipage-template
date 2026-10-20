# AI lead responder (demo)

An n8n workflow for local trades (plumbing first, HVAC second). A website form lead or a missed call comes in, the lead gets an instant reply with 2-3 qualifying questions and an open booking time, and the owner gets an alert.

**This is a demo.** Every sending step posts to a local mock server that only writes a log. Nothing sends real texts or emails. All keys are placeholders.

- Simulated conversation (GitHub Pages): https://trae77.github.io/multipage-template/demos/lead-responder/
- Workflow: [`n8n/lead-responder.workflow.json`](n8n/lead-responder.workflow.json). It is generated from [`tools/make-workflow.mjs`](tools/make-workflow.mjs); edit that file, then run `node lead-responder/tools/make-workflow.mjs`.

## Flow

```
Lead webhook (POST /webhook/lead-responder)
 → Config (placeholders)        reads env vars; a value still in {{ }} counts as not set
 → Normalize lead + consent     web form or Twilio-style missed call; plumbing vs HVAC
 → Offer booking slot           first open time from a stub list
 → LLM key set? ─ yes → LLM (OpenAI-compatible HTTP, POST {LLM_BASE_URL}/chat/completions)
               └ no ──────────┐ (an LLM error also falls through to the template)
 → Compose reply                LLM JSON {reply, questions} or the fixed template
 → SMS allowed? ─ yes → Send SMS (MOCK)
               └ no → Email on file? ─ yes → Send email (MOCK)
                                       └ no → (no auto-reply; owner is asked to call back)
 → Build owner alert → Owner alert (MOCK) → Respond (JSON summary, "simulated": true)
```

SMS rule: a text goes out only when `sms_consent` is true, which comes from the optional SMS box on the site forms. That box is never pre-checked. A missed call is not treated as SMS consent: missed-call text-back is off unless `MISSED_CALL_SMS=on`.

The LLM prompt tells the model not to quote prices, promise arrival times, or claim licenses.

## Run it locally (free)

With Docker:

```bash
docker compose -f lead-responder/docker-compose.yml up -d
# n8n UI: http://localhost:5678 (create the local owner account on first visit)
docker compose -f lead-responder/docker-compose.yml exec n8n n8n import:workflow --input=/workflows/lead-responder.workflow.json
```

Then open the workflow in the UI and click **Publish** (older n8n 1.x: toggle **Active**). If you used the CLI instead (`n8n publish:workflow --id=<id>`), restart n8n afterwards.

Without Docker (n8n 2.x needs Node 24 or newer):

```bash
npm i -g n8n
node lead-responder/mock/mock-sender.mjs &      # mock sender on :8787
N8N_BLOCK_ENV_ACCESS_IN_NODE=false MOCK_SEND_URL=http://127.0.0.1:8787 n8n start
```

Send the sample leads:

```bash
cd lead-responder/samples
curl -X POST localhost:5678/webhook/lead-responder -H 'Content-Type: application/json' -d @form-lead.json             # SMS (consent ticked)
curl -X POST localhost:5678/webhook/lead-responder -H 'Content-Type: application/json' -d @form-lead-no-consent.json  # email
curl -X POST localhost:5678/webhook/lead-responder -H 'Content-Type: application/json' -d @missed-call.json           # owner call-back
curl localhost:8787/log                                                                                               # what would have been sent
```

To try the LLM branch without a real key, point it at the mock: `LLM_API_KEY=test LLM_BASE_URL=http://127.0.0.1:8787/v1 LLM_MODEL=mock`. The mock answers `/v1/chat/completions` with a canned reply.

## Env placeholders

| Variable | Default | Purpose |
|---|---|---|
| `LLM_API_KEY` | `{{LLM_API_KEY}}` | Key for an OpenAI-compatible API. While it is a placeholder, the template reply is used. |
| `LLM_BASE_URL` | `{{LLM_BASE_URL}}` | Base URL that ends before `/chat/completions`, for example `https://host/v1`. |
| `LLM_MODEL` | `{{LLM_MODEL}}` | Model name for that API. |
| `BUSINESS_NAME` | `Sample Plumbing Co.` | Used in replies. |
| `OWNER_ALERT_TO` | `{{OWNER_ALERT_TO}}` | Owner's phone or email for alerts (mock only in this demo). |
| `MOCK_SEND_URL` | `http://mock-sender:8787` | Where every "send" goes. |
| `MISSED_CALL_SMS` | `off` | `on` texts missed callers. See the consent notes first. |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | must be `false` | Lets the Config node read these variables. Otherwise the placeholders and defaults are used. |

## Hooking up the website forms

multipage-template has an optional `LEAD_WEBHOOK_URL`, which is empty by default. Set it as an env var at build time, or as `"leadWebhookUrl"` in `site.config.json`. Only `https://` URLs, or `http://localhost` for testing, are accepted.

```bash
LEAD_WEBHOOK_URL=https://your-n8n-host/webhook/lead-responder npm run build
```

When it is set:

- The quote, contact and booking forms get an unchecked, optional SMS consent box (`sms_consent`) with STOP/HELP wording.
- After the form saves as usual, the browser also POSTs the form data as JSON to the webhook. The JSON includes `source`, `trade`, `business`, `sms_consent` (true/false), `page` and `submittedAt`. A webhook failure never blocks the form.

When it is empty, the built pages are the same as before.

## Verified on the box (2026-10-19)

n8n 2.43.8 ran on Node 24 from npm, because Docker isn't available on the box. The same workflow file is what `docker-compose.yml` mounts.

- `n8n import:workflow` imported the file and `n8n publish:workflow` published it. The production webhook answered.
- **Template path (no key):**
  - The consented form lead got an SMS reply through the mock.
  - The HVAC form lead without consent got an email reply through the mock.
  - The missed call got no auto-reply, and the owner was asked to call back.
  - All three sent an owner alert to the mock. The mock log showed six entries.
- **LLM path:** the mock OpenAI-compatible endpoint's reply was used (`generated_by: "llm"`). With `MISSED_CALL_SMS=on`, the missed call got an SMS through the mock.
- **LLM failure:** with an unreachable LLM URL, the workflow fell back to the template.
- **CORS:** the preflight from `https://trae77.github.io` passed.
- **Site forms:** a demo build with `LEAD_WEBHOOK_URL=http://localhost:5678/webhook/lead-responder` posted the quote form, with the SMS box ticked, to n8n from headless Chromium. n8n chose SMS (mock).

## Still needed for a real client

- **SMS number and A2P 10DLC.** You need a Twilio or other SMS number. US carriers require A2P 10DLC brand and campaign registration before application-to-person texts go out on a 10-digit number. Registration needs the business's legal details, sample messages and the opt-in description. Carrier review takes time, and providers and carriers charge fees.
- **Missed-call detection.** Point the provider's call status callback at the webhook. The workflow already reads `From`, `To` and `CallStatus`. Add the provider's request signature check (for Twilio, `X-Twilio-Signature`) before going live.
- **Real senders.** Replace the three MOCK nodes with the provider's SMS node or API and an email sender (for example SMTP or a transactional email service with SPF, DKIM and DMARC set up on the client's domain). Keep STOP, HELP and unsubscribe handling, and store opt-outs.
- **Replies from the lead.** This demo only sends the first message. Two-way handling (the lead answers the questions or replies YES to the time) needs an inbound SMS/email webhook and a conversation store.
- **LLM key.** An account and key for an OpenAI-compatible API, with usage limits set. Keep the template fallback.
- **Calendar.** Replace the stub slot list with the client's real calendar, for example Google Calendar or Calendly availability, and create the booking only once the lead confirms.
- **Hosting n8n.** n8n needs to run somewhere that's always on with HTTPS, a public webhook URL, persistent storage and backups. Set `N8N_ENCRYPTION_KEY`. Restrict CORS (`allowedOrigins`) to the client's domain.
- **Consent and TCPA.** This is not legal advice; have the client confirm with their own counsel.
  - The TCPA and FCC rules limit automated texts. Marketing texts need prior express written consent, and consent can't be required to buy.
  - Opt-outs must be honored by any reasonable means. The FCC rule that took effect April 11, 2025 says within 10 business days.
  - Keep a record of when and how each person opted in: the page, the checkbox text and the time. The workflow receives `page` and `submittedAt` for this.
  - Respect quiet hours (8 AM to 9 PM at the recipient's location) and any stricter state rules.
  - Missed-call text-back stays off until the client has reviewed it.
- **Privacy page.** Update the site's privacy page to name the SMS and email providers and say that an AI tool drafts the first reply.
