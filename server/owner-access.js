// Owner gate: the owner must come through Cloudflare Access (Cf-Access-Jwt-Assertion, RS256, JWKS from the team
// domain, aud = ACCESS_AUD) AND the token's email must be in OWNER_EMAILS. Password alone never grants owner.
// Fails closed: missing ACCESS_TEAM_DOMAIN / ACCESS_AUD / OWNER_EMAILS -> no owner access at all.
// Service tokens (common_name, no email) are denied.
import crypto from 'node:crypto';

export const ownerEmailsFrom = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const b64j = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export function makeAccessVerifier({ teamDomain, aud, ownerEmails, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const team = String(teamDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const emails = ownerEmailsFrom(ownerEmails);
  let cache = { keys: null, at: 0 };
  async function keys(force) {
    if (!force && cache.keys && now() - cache.at < 3600e3) return cache.keys;
    const r = await fetchImpl(`https://${team}/cdn-cgi/access/certs`);
    const j = await r.json(); cache = { keys: j.keys || [], at: now() }; return cache.keys;
  }
  // Returns the verified owner email, or null.
  return async function verifyOwnerAccess(req) {
    try {
      if (!team || !aud || !emails.length) return null;
      const jwt = String(req.headers['cf-access-jwt-assertion'] || '');
      const [h, p, s] = jwt.split('.'); if (!h || !p || !s) return null;
      const head = b64j(h), claims = b64j(p);
      if (head.alg !== 'RS256') return null;
      let jwk = (await keys(false)).find((k) => k.kid === head.kid);
      if (!jwk) jwk = (await keys(true)).find((k) => k.kid === head.kid);
      if (!jwk) return null;
      const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
      if (!ok) return null;
      const t = Math.floor(now() / 1000);
      const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
      if (!audOk || !(claims.exp > t) || (claims.nbf && claims.nbf > t + 60)) return null;
      if (claims.iss && claims.iss !== `https://${team}`) return null;
      if (claims.common_name || !claims.email) return null; // service tokens denied
      const email = String(claims.email).toLowerCase();
      return emails.includes(email) ? email : null;
    } catch { return null; }
  };
}
