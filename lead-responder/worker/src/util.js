export const now = () => new Date().toISOString();
export function normPhone(p) {
  if (!p) return null;
  const d = String(p).replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(d)) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return null;
}
export const normEmail = (e) => (e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e).trim()) ? String(e).trim().toLowerCase() : null);
export const truthy = (v) => v === true || v === 'true' || v === 'on' || v === '1' || v === 1;
