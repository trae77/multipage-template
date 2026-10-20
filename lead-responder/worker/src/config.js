// Per-client config. In production, store each client as JSON in the CLIENTS env var
// (a JSON object keyed by client id) or one secret per client. See clients/example.json.
import { truthy } from './util.js';

const DEFAULTS = {
  channels: { sms_reply: false, email_reply: true, owner_alert_sms: false, owner_alert_email: true,
              missed_call_sms: false, review_email: false, review_sms: false },
  compliance: { a10dlc_approved: false, owner_approved: false },
};

export function loadClients(env) {
  let raw = env.CLIENTS;
  if (!raw) return {};
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const out = {};
  for (const [id, c] of Object.entries(obj)) out[id] = normalizeClient(id, c);
  return out;
}

export function normalizeClient(id, c) {
  const client = {
    id, business_name: c.business_name, hours: c.hours || '', services: c.services || [],
    owner_phone: c.owner_phone || null, owner_email: c.owner_email || null,
    from_phone: c.from_phone || null, from_email: c.from_email || null,
    review_url: c.review_url || null, booking_slots: c.booking_slots || [],
    channels: { ...DEFAULTS.channels, ...(c.channels || {}) },
    compliance: { ...DEFAULTS.compliance, ...(c.compliance || {}) },
  };
  for (const k of Object.keys(client.channels)) client.channels[k] = truthy(client.channels[k]);
  for (const k of Object.keys(client.compliance)) client.compliance[k] = truthy(client.compliance[k]);
  if (!client.business_name) throw new Error(`client ${id}: business_name required`);
  return client;
}

// HARD GATE: any SMS to a lead/customer (missed-call text-back, review SMS, auto-reply SMS)
// needs an approved A2P 10DLC campaign AND William's explicit OK for this client.
// Channel flags alone can never turn SMS on.
export function a2pGateOpen(client) {
  return client.compliance.a10dlc_approved === true && client.compliance.owner_approved === true;
}

export function smsAllowed(client, channel) {
  return a2pGateOpen(client) && client.channels[channel] === true;
}
