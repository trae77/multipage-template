// Validates X-Twilio-Signature (HMAC-SHA1 of URL + sorted POST params, base64).
export async function validTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}
