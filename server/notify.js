// Provider-agnostic notifications. OFF unless env vars are set.
//   Email: RESEND_API_KEY + NOTIFY_FROM, or SMTP_URL (needs `npm i nodemailer`) + NOTIFY_FROM
//   Text:  TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
//   Owner destinations: NOTIFY_OWNER_EMAIL, NOTIFY_OWNER_PHONE
const env = process.env;
export const notifyStatus = () => ({ email: !!(env.NOTIFY_FROM && (env.RESEND_API_KEY || env.SMTP_URL)), sms: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) });
async function sendEmail(to, subject, text) {
  if (env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.NOTIFY_FROM, to, subject, text }) });
    if (!r.ok) throw new Error('Resend ' + r.status);
  } else if (env.SMTP_URL) {
    const { default: nm } = await import('nodemailer');
    await nm.createTransport(env.SMTP_URL).sendMail({ from: env.NOTIFY_FROM, to, subject, text });
  }
}
async function sendSms(to, body) {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ From: env.TWILIO_FROM, To: to, Body: body }) });
  if (!r.ok) throw new Error('Twilio ' + r.status);
}
const TEMPLATES = {
  'lead.created': (d) => ({ to: 'owner', subject: `New quote request from ${d.name}`, text: `${d.name} (${d.phone}${d.email ? ', ' + d.email : ''}) asked about ${d.service || 'a job'}:\n\n${d.message}` }),
  'booking.created': (d) => ({ to: 'owner', subject: `Booking request ${d.date} ${d.time}`, text: `${d.name} (${d.phone}) requested ${d.date} at ${d.time} for ${d.service || 'a visit'}.` }),
  'booking.updated': (d) => ({ to: 'customer', subject: `Your booking is ${d.status}`, text: `Your visit on ${d.date} at ${d.time} is ${d.status}.` }),
  'quote.sent': (d) => ({ to: 'customer', subject: `New quote: ${d.title}`, text: 'You have a new quote. Log in to review it.' }),
  'message.created': (d) => ({ to: d.from === 'owner' ? 'customer' : 'owner', subject: 'New message', text: d.body }),
};
// hooks: tests can push a function to observe events without sending anything.
export const hooks = [];
export async function notify(event, data, recipient = {}) {
  for (const h of hooks) h(event, data, recipient);
  const t = TEMPLATES[event]?.(data); if (!t) return;
  const s = notifyStatus(); const toOwner = t.to === 'owner';
  const email = toOwner ? env.NOTIFY_OWNER_EMAIL : recipient.email; const phone = toOwner ? env.NOTIFY_OWNER_PHONE : recipient.phone;
  try {
    if (s.email && email) await sendEmail(email, t.subject, t.text);
    if (s.sms && phone) await sendSms(phone, `${t.subject}: ${t.text}`.slice(0, 300));
  } catch (e) { console.error('[notify]', event, e.message); }
}
