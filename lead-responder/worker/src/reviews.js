// Review requests: the SAME message goes to EVERY customer in the list.
// No satisfaction pre-screen ("review gating"), no rewards/discounts/entries (incentives).
// Only skips: opted-out/suppressed addresses, missing contact info, and SMS while the A2P gate is closed.
import { normPhone, normEmail } from './util.js';
import { smsAllowed } from './config.js';

const BANNED = /(discount|coupon|gift ?card|reward|free |\$\d|% off|enter to win|raffle|happy with|satisfied|only if|5[- ]star)/i;

export function reviewMessage(client, customer) {
  const name = customer.name ? ` ${customer.name}` : '';
  return `Hi${name}, thanks for choosing ${client.business_name}. Would you share your honest feedback in a review? ${client.review_url}`;
}

export function assertCompliant(text) {
  if (BANNED.test(text)) throw new Error('review message must not gate or incentivize reviews');
}

export async function sendReviewRequests(ctx, client, customers, { template } = {}) {
  if (!client.review_url) throw new Error('client.review_url required');
  const report = { email: 0, sms: 0, skipped: [], dry_run: ctx.providers.dry };
  for (const c of customers) {
    // Deliberately ignores any rating/satisfaction field on the customer record.
    const body = template ? template(client, c) : reviewMessage(client, c);
    assertCompliant(body);
    const phone = normPhone(c.phone), email = normEmail(c.email);
    let sent = false;
    if (phone && smsAllowed(client, 'review_sms') && !(await ctx.store.isSuppressed(client.id, 'sms', phone))
        && (await ctx.store.getConsent(client.id, 'sms', phone)) === 'granted') {
      const r = await ctx.providers.sms.send({ channel: 'sms', to: phone, from: client.from_phone, body: body + ' Reply STOP to opt out.' });
      await ctx.store.log(client.id, 'send', { kind: 'review_request', channel: 'sms', to: phone, ok: r.ok, dry_run: !!r.dry_run });
      report.sms++; sent = true;
    }
    if (!sent && email && client.channels.review_email && !(await ctx.store.isSuppressed(client.id, 'email', email))) {
      const r = await ctx.providers.email.send({ channel: 'email', to: email, from: client.from_email,
        subject: `How did we do? — ${client.business_name}`,
        body: body + `\n\nTo stop these emails, reply "unsubscribe".`, headers: { 'List-Unsubscribe': `<mailto:${client.from_email}?subject=unsubscribe>` } });
      await ctx.store.log(client.id, 'send', { kind: 'review_request', channel: 'email', to: email, ok: r.ok, dry_run: !!r.dry_run });
      report.email++; sent = true;
    }
    if (!sent) report.skipped.push({ customer: c.name || c.email || c.phone || null, reason: !phone && !email ? 'no_contact' : 'opted_out_or_channel_off' });
  }
  await ctx.store.log(client.id, 'review_batch', report);
  return report;
}
