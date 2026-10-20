// Generates ../n8n/lead-responder.workflow.json (run: node lead-responder/tools/make-workflow.mjs).
// Keeping the Code-node JavaScript here as real JS avoids hand-escaping it inside JSON.
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const js = (f) => f.toString().replace(/^[^{]*{\n?/, '').replace(/}\s*$/, '').replace(/^ {2}/gm, '');

function config() {
  // Placeholders only. Real values come from env vars on the n8n host (see README); a value still
  // wrapped in {{ }} counts as "not set". No real keys belong in this file.
  const env = (k, d) => { try { const v = $env[k]; return v === undefined || v === '' ? d : v; } catch (e) { return d; } };
  const cfg = {
    business_name: env('BUSINESS_NAME', 'Sample Plumbing Co.'),
    owner_name: env('OWNER_NAME', 'the owner'),
    llm_api_key: env('LLM_API_KEY', '{{LLM_API_KEY}}'),
    llm_base_url: env('LLM_BASE_URL', '{{LLM_BASE_URL}}'),
    llm_model: env('LLM_MODEL', '{{LLM_MODEL}}'),
    mock_send_url: env('MOCK_SEND_URL', 'http://mock-sender:8787'),
    owner_alert_to: env('OWNER_ALERT_TO', '{{OWNER_ALERT_TO}}'),
    // Off by default. A missed call is not the same as SMS consent; turn on only after the client
    // has reviewed it with their own counsel (README, consent notes).
    missed_call_sms: String(env('MISSED_CALL_SMS', 'off')).toLowerCase() === 'on',
  };
  const set = (v) => typeof v === 'string' && v.trim() !== '' && !/^\{\{.*\}\}$/.test(v.trim());
  cfg.llm_ready = set(cfg.llm_api_key) && set(cfg.llm_base_url) && set(cfg.llm_model);
  return [{ json: { ...$input.first().json, config: cfg } }];
}

function normalize() {
  // Accepts a website form lead (multipage-template LEAD_WEBHOOK_URL) or a simulated
  // Twilio-style missed-call status callback (CallStatus no-answer/busy/failed, From, To).
  const raw = $input.first().json; const b = raw.body || raw;
  const cfg = raw.config;
  const digits = (p) => String(p || '').replace(/[^\d+]/g, '');
  const missed = !!(b.CallSid || b.CallStatus || b.source === 'missed-call');
  const tradeKey = String(b.trade || '').toLowerCase();
  const trade = /\b(hvac|heat|heating|air|ac|a\/c|furnace|cooling)\b/.test(tradeKey + ' ' + (b.service || '')) ? 'hvac' : 'plumbing';
  const consent = b.sms_consent === true || b.sms_consent === 'yes' || b.sms_consent === 'true' || b.sms_consent === 'on';
  const lead = {
    id: 'lead_' + Date.now().toString(36),
    source: missed ? 'missed-call' : (b.source || 'web-form'),
    trade,
    name: String(b.name || '').trim() || null,
    first_name: String(b.name || '').trim().split(/\s+/)[0] || null,
    phone: digits(missed ? b.From : b.phone) || null,
    email: String(b.email || '').trim() || null,
    service: String(b.service || '').trim() || null,
    message: String(b.message || b.notes || '').trim() || null,
    address: String(b.address || '').trim() || null,
    call_status: missed ? (b.CallStatus || 'no-answer') : null,
    received_at: new Date().toISOString(),
    // SMS only with the (unchecked by default) consent box ticked. A missed call is NOT SMS consent;
    // missed-call text-back only runs when MISSED_CALL_SMS=on (default off; see README).
    sms_consent: missed ? !!(cfg && cfg.missed_call_sms) : consent,
  };
  lead.reply_channel = lead.sms_consent && lead.phone ? 'sms' : (lead.email ? 'email' : 'owner-callback');
  return [{ json: { lead, config: cfg } }];
}

function slot() {
  // Stub availability list. Replace with a real calendar lookup for a client (README).
  const { lead, config } = $input.first().json;
  const stub = ['tomorrow 9:00 AM', 'tomorrow 1:00 PM', 'the day after tomorrow 10:00 AM'];
  const busy = ['tomorrow 9:00 AM'];
  const open = stub.filter((s) => !busy.includes(s));
  return [{ json: { lead, config, slots: open, offered_slot: open[0] || null } }];
}

function compose() {
  // Uses the LLM reply when the HTTP node returned one; otherwise a fixed template (no key needed).
  const base = $('Offer booking slot').first().json; const { lead, config, offered_slot } = base;
  const r = $input.first().json; let llm = null;
  try { const c = r.choices?.[0]?.message?.content; if (c) { const p = JSON.parse(c.replace(/^```(json)?|```$/g, '').trim()); if (p.reply && Array.isArray(p.questions)) llm = p; } } catch (e) {}
  const Q = {
    plumbing: ['Is water actively leaking right now?', 'Which fixture or area is it (kitchen, bath, water heater, main line)?', 'Is the home on city water or a well?'],
    hvac: ['Is it heating, cooling, or both that is not working?', 'About how old is the system?', 'Is anyone in the home at health risk from the temperature?'],
  };
  const hi = lead.first_name ? `Hi ${lead.first_name}, ` : 'Hi, ';
  const why = lead.source === 'missed-call' ? 'sorry we missed your call' : `thanks for your ${lead.service ? lead.service.toLowerCase() + ' ' : ''}request`;
  const fallback = { reply: `${hi}${why}. This is ${config.business_name.replace(/\.$/, '')}.`, questions: Q[lead.trade].slice(0, 3) };
  const out = llm || fallback;
  const slotLine = offered_slot ? `The next open time is ${offered_slot}. Reply YES to request it, or suggest another time.` : 'We will call to set a time.';
  const stop = lead.reply_channel === 'sms' ? ' Reply STOP to opt out, HELP for help.' : '';
  const text = [out.reply, ...out.questions.map((q, i) => `${i + 1}. ${q}`), slotLine].join('\n') + stop;
  return [{ json: { lead, config, offered_slot, reply: { channel: lead.reply_channel, generated_by: llm ? 'llm' : 'template', text, questions: out.questions } } }];
}

function alert() {
  const d = $('Compose reply').first().json; const sent = $input.first().json;
  const l = d.lead;
  return [{ json: { ...d, send_result: sent, owner_alert: {
    to: d.config.owner_alert_to, channel: 'mock',
    text: `New ${l.trade} lead (${l.source}): ${l.name || 'unknown name'} ${l.phone || ''} ${l.email || ''}. ${l.service || ''} ${l.message || ''}`.replace(/\s+/g, ' ').trim()
      + (d.reply.channel === 'owner-callback' ? ' | No auto-reply sent (no SMS consent, no email). Please call back.' : ` | Auto-reply via ${d.reply.channel} (${d.reply.generated_by}). Offered: ${d.offered_slot || 'none'}.`),
  } } }];
}

const code = (id, name, fn, pos) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode: js(fn) } });
const mockPost = (id, name, kind, bodyExpr, pos) => ({ id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
  notes: 'MOCK sender: posts to the local log server, never to a real SMS/email provider.',
  parameters: { method: 'POST', url: `={{ $json.config.mock_send_url }}/${kind}`, sendBody: true, specifyBody: 'json', jsonBody: bodyExpr, options: {} } });

const nodes = [
  { id: 'n1', name: 'Lead webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300], webhookId: '6f1c2b1e-7c55-4f7e-9a51-1ead0e5ec001',
    parameters: { httpMethod: 'POST', path: 'lead-responder', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
  code('n2', 'Config (placeholders)', config, [220, 300]),
  code('n3', 'Normalize lead + consent', normalize, [440, 300]),
  code('n4', 'Offer booking slot', slot, [660, 300]),
  { id: 'n5', name: 'LLM key set?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [880, 300],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: 'c1', leftValue: '={{ $json.config.llm_ready }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } },
  { id: 'n6', name: 'LLM (OpenAI-compatible)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, 200], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: '={{ $json.config.llm_base_url }}/chat/completions', sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $json.config.llm_api_key }}' }] },
      sendBody: true, specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ model: $json.config.llm_model, temperature: 0.3, response_format: { type: 'json_object' }, messages: [
 { role: 'system', content: 'You write the first reply for a local ' + $json.lead.trade + ' business named ' + $json.config.business_name + '. Facts only: do not quote prices, promise arrival times, or claim licenses. Return JSON {"reply": one or two short friendly sentences using the first name if given, "questions": 2 or 3 short qualifying questions}.' },
 { role: 'user', content: JSON.stringify({ name: $json.lead.first_name, source: $json.lead.source, service: $json.lead.service, message: $json.lead.message }) } ] }) }}`,
      options: { timeout: 15000 } } },
  code('n7', 'Compose reply', compose, [1320, 300]),
  { id: 'n8', name: 'SMS allowed?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [1540, 300],
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: 'c2', leftValue: '={{ $json.reply.channel }}', rightValue: 'sms', operator: { type: 'string', operation: 'equals' } }] }, options: {} } },
  { id: 'n14', name: 'Email on file?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [1760, 420], notes: 'No consent and no email (e.g. a missed call): no auto-reply, the owner alert asks for a call back.',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: 'c3', leftValue: '={{ $json.lead.email }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }] }, options: {} } },
  mockPost('n9', 'Send SMS (MOCK)', 'sms', '={{ JSON.stringify({ to: $json.lead.phone, text: $json.reply.text, lead_id: $json.lead.id }) }}', [1760, 200]),
  mockPost('n10', 'Send email (MOCK)', 'email', '={{ JSON.stringify({ to: $json.lead.email, subject: "Re: your request to " + $json.config.business_name, text: $json.reply.text, lead_id: $json.lead.id, channel: $json.reply.channel }) }}', [1980, 400]),
  code('n11', 'Build owner alert', alert, [2200, 300]),
  mockPost('n12', 'Owner alert (MOCK)', 'owner-alert', '={{ JSON.stringify({ to: $json.owner_alert.to, text: $json.owner_alert.text, lead_id: $json.lead.id }) }}', [2420, 300]),
  { id: 'n13', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [2640, 300],
    parameters: { respondWith: 'json', responseBody: `={{ JSON.stringify({ ok: true, simulated: true, lead: $('Build owner alert').first().json.lead, reply: $('Build owner alert').first().json.reply, offered_slot: $('Build owner alert').first().json.offered_slot, owner_alert: $('Build owner alert').first().json.owner_alert }) }}`, options: {} } },
];
const c = (to, i = 0) => ({ node: to, type: 'main', index: i });
const connections = {
  'Lead webhook': { main: [[c('Config (placeholders)')]] },
  'Config (placeholders)': { main: [[c('Normalize lead + consent')]] },
  'Normalize lead + consent': { main: [[c('Offer booking slot')]] },
  'Offer booking slot': { main: [[c('LLM key set?')]] },
  'LLM key set?': { main: [[c('LLM (OpenAI-compatible)')], [c('Compose reply')]] },
  'LLM (OpenAI-compatible)': { main: [[c('Compose reply')]] },
  'Compose reply': { main: [[c('SMS allowed?')]] },
  'SMS allowed?': { main: [[c('Send SMS (MOCK)')], [c('Email on file?')]] },
  'Email on file?': { main: [[c('Send email (MOCK)')], [c('Build owner alert')]] },
  'Send SMS (MOCK)': { main: [[c('Build owner alert')]] },
  'Send email (MOCK)': { main: [[c('Build owner alert')]] },
  'Build owner alert': { main: [[c('Owner alert (MOCK)')]] },
  'Owner alert (MOCK)': { main: [[c('Respond')]] },
};
const wf = { name: 'Lead responder (demo, mock senders)', nodes, connections, active: false, settings: { executionOrder: 'v1' }, pinData: {}, meta: { templateCredsSetupCompleted: true }, tags: [] };
fs.writeFileSync(path.join(here, '../n8n/lead-responder.workflow.json'), JSON.stringify(wf, null, 2) + '\n');
console.log('wrote n8n/lead-responder.workflow.json');
