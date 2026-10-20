// Common interface:  provider.send({ channel: 'sms'|'email', to, from, subject?, body })
//   -> { ok, id, provider, dry_run? }
// DRY_RUN is the default: anything other than DRY_RUN === 'false' never calls a real API.

export class MockProvider {
  constructor() { this.sent = []; this.name = 'mock'; }
  async send(msg) { this.sent.push(msg); return { ok: true, id: 'mock-' + this.sent.length, provider: 'mock' }; }
}

export class TwilioSms {
  constructor({ accountSid, authToken, fetchImpl = fetch }) { Object.assign(this, { accountSid, authToken, fetchImpl }); this.name = 'twilio'; }
  async send({ to, from, body }) {
    const res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, id: j.sid || null, provider: 'twilio', error: res.ok ? undefined : j.message || res.status };
  }
}

export class ResendEmail {
  constructor({ apiKey, fetchImpl = fetch }) { Object.assign(this, { apiKey, fetchImpl }); this.name = 'resend'; }
  async send({ to, from, subject, body, headers }) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text: body, headers }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, id: j.id || null, provider: 'resend', error: res.ok ? undefined : j.message || res.status };
  }
}

class DryRun {
  constructor(inner, sink) { this.inner = inner; this.sink = sink; this.name = 'dry-run:' + inner.name; }
  async send(msg) { this.sink.push(msg); return { ok: true, id: 'dry-' + this.sink.length, provider: this.name, dry_run: true }; }
}

export function makeProviders(env, overrides = {}) {
  const dry = env.DRY_RUN !== 'false';
  const sink = [];
  const mock = new MockProvider();
  let sms = overrides.sms || (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
    ? new TwilioSms({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN }) : mock);
  let email = overrides.email || (env.RESEND_API_KEY ? new ResendEmail({ apiKey: env.RESEND_API_KEY }) : mock);
  if (dry) { sms = new DryRun(sms, sink); email = new DryRun(email, sink); }
  return { sms, email, dry, sink, mock };
}
