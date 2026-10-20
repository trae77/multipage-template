import { normPhone, normEmail, truthy } from './util.js';
import { smsAllowed, a2pGateOpen } from './config.js';
import { composeReply } from './llm.js';

export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'];
export const START_WORDS = ['START', 'UNSTOP', 'YES'];
export const HELP_WORDS = ['HELP', 'INFO'];

export function normalizeLead(body) {
  const text = `${body.message || ''} ${body.service || ''}`.toLowerCase();
  return {
    name: (body.name || '').toString().slice(0, 80) || null,
    phone: normPhone(body.phone), email: normEmail(body.email),
    message: (body.message || '').toString().slice(0, 2000),
    trade: /furnace|ac\b|a\/c|hvac|heat|cool|thermostat/.test(text) ? 'hvac' : 'plumbing',
    sms_consent: truthy(body.sms_consent),
    consent_text: body.consent_text || null,
  };
}

async function canText(ctx, client, channel, phone) {
  if (!phone) return { ok: false, why: 'no_phone' };
  if (!smsAllowed(client, channel)) return { ok: false, why: a2pGateOpen(client) ? 'channel_off' : 'a2p_gate_closed' };
  if (await ctx.store.isSuppressed(client.id, 'sms', phone)) return { ok: false, why: 'suppressed' };
  if ((await ctx.store.getConsent(client.id, 'sms', phone)) !== 'granted') return { ok: false, why: 'no_consent' };
  return { ok: true };
}

async function canEmail(ctx, client, channel, email) {
  if (!email) return { ok: false, why: 'no_email' };
  if (!client.channels[channel]) return { ok: false, why: 'channel_off' };
  if (await ctx.store.isSuppressed(client.id, 'email', email)) return { ok: false, why: 'suppressed' };
  return { ok: true };
}

async function send(ctx, client, kind, msg) {
  const p = msg.channel === 'sms' ? ctx.providers.sms : ctx.providers.email;
  const r = await p.send(msg);
  await ctx.store.log(client.id, 'send', { kind, channel: msg.channel, to: msg.to, ok: r.ok, provider: r.provider, dry_run: !!r.dry_run, id: r.id, error: r.error });
  return r;
}

export async function handleLead(ctx, client, body) {
  const lead = normalizeLead(body);
  await ctx.store.log(client.id, 'lead', { trade: lead.trade, has_phone: !!lead.phone, has_email: !!lead.email, sms_consent: lead.sms_consent });
  if (lead.phone && lead.sms_consent) {
    await ctx.store.setConsent(client.id, 'sms', lead.phone, 'granted', 'web_form', { text: lead.consent_text, at: new Date().toISOString(), ip: body._ip || null });
  }
  const slot = client.booking_slots[0] || null;
  const composed = await composeReply(ctx.env, client, lead, slot, ctx.fetch);
  const text = `${composed.reply} ${composed.questions.map((q, i) => `${i + 1}) ${q}`).join(' ')}`;
  const result = { reply_source: composed.source, lead_reply: null, owner_alert: [], dry_run: ctx.providers.dry };

  const t = await canText(ctx, client, 'sms_reply', lead.phone);
  if (t.ok) {
    await send(ctx, client, 'lead_reply', { channel: 'sms', to: lead.phone, from: client.from_phone, body: `${text} Reply STOP to opt out, HELP for help.` });
    result.lead_reply = 'sms';
  } else {
    const e = await canEmail(ctx, client, 'email_reply', lead.email);
    if (e.ok) {
      await send(ctx, client, 'lead_reply', { channel: 'email', to: lead.email, from: client.from_email, subject: `Thanks for contacting ${client.business_name}`, body: text });
      result.lead_reply = 'email';
    } else result.lead_reply_skipped = [t.why, e.why];
  }

  const alert = `New lead for ${client.business_name}: ${lead.name || 'unknown'} ${lead.phone || ''} ${lead.email || ''} — ${lead.message.slice(0, 200)}${result.lead_reply ? '' : ' (no auto-reply sent; please call back)'}`;
  // Owner alerts go to the client's own owner (transactional, owner opted in at onboarding).
  if (client.channels.owner_alert_sms && a2pGateOpen(client) && client.owner_phone) {
    await send(ctx, client, 'owner_alert', { channel: 'sms', to: client.owner_phone, from: client.from_phone, body: alert.slice(0, 320) });
    result.owner_alert.push('sms');
  }
  if (client.channels.owner_alert_email && client.owner_email) {
    await send(ctx, client, 'owner_alert', { channel: 'email', to: client.owner_email, from: client.from_email, subject: 'New lead', body: alert });
    result.owner_alert.push('email');
  }
  return result;
}

// Missed call: text-back is OFF unless the A2P gate is open AND missed_call_sms is on.
// A missed call is never treated as SMS consent, so the caller must also have prior consent on file.
export async function handleMissedCall(ctx, client, body) {
  const from = normPhone(body.From || body.from);
  await ctx.store.log(client.id, 'missed_call', { from });
  const t = await canText(ctx, client, 'missed_call_sms', from);
  const out = { text_back: false, why: t.why || null, owner_alert: [] };
  if (t.ok) {
    await send(ctx, client, 'missed_call_text', { channel: 'sms', to: from, from: client.from_phone,
      body: `Sorry we missed your call at ${client.business_name}. How can we help? Reply STOP to opt out.` });
    out.text_back = true; out.why = null;
  }
  if (client.channels.owner_alert_email && client.owner_email) {
    await send(ctx, client, 'owner_alert', { channel: 'email', to: client.owner_email, from: client.from_email, subject: 'Missed call', body: `Missed call from ${from || 'unknown'}. Please call back.` });
    out.owner_alert.push('email');
  }
  return out;
}

// Inbound SMS keywords. Twilio also applies its own default STOP handling; we mirror it in our suppression list.
export async function handleInboundSms(ctx, client, body) {
  const from = normPhone(body.From);
  const word = String(body.Body || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  let action = 'message', reply = null;
  if (STOP_WORDS.includes(word)) {
    await ctx.store.suppress(client.id, 'sms', from, 'keyword:' + word);
    await ctx.store.setConsent(client.id, 'sms', from, 'revoked', 'keyword', { word });
    action = 'stop';
    reply = `${client.business_name}: You're unsubscribed and will get no more texts. Reply START to resubscribe.`;
  } else if (START_WORDS.includes(word)) {
    await ctx.store.unsuppress(client.id, 'sms', from);
    await ctx.store.setConsent(client.id, 'sms', from, 'granted', 'keyword', { word });
    action = 'start';
    reply = `${client.business_name}: You're resubscribed. Msg & data rates may apply. Reply STOP to opt out.`;
  } else if (HELP_WORDS.includes(word)) {
    action = 'help';
    reply = `${client.business_name}: For help call ${client.owner_phone || 'us'}${client.owner_email ? ' or email ' + client.owner_email : ''}. Reply STOP to opt out.`;
  }
  await ctx.store.log(client.id, 'inbound_sms', { from, action });
  // Keyword confirmations are only sent from a registered (gate-open) number.
  if (reply && a2pGateOpen(client)) await send(ctx, client, 'keyword_reply', { channel: 'sms', to: from, from: client.from_phone, body: reply });
  return { action, reply };
}
