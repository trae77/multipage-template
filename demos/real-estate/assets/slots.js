// Booking slot math shared by the browser (demo mode) and the server.
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export function slotsFor(date, cfg = {}, taken = [], now = new Date()) {
  const c = { slotMinutes: 60, dayStart: '08:00', dayEnd: '17:00', days: [1, 2, 3, 4, 5], leadDays: 1, windowDays: 21, ...cfg };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return [];
  const d = new Date(date + 'T12:00:00');
  if (Number.isNaN(d.getTime()) || !c.days.includes(d.getDay())) return [];
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < c.leadDays || diff > c.windowDays) return [];
  const out = [];
  for (let m = toMin(c.dayStart); m + c.slotMinutes <= toMin(c.dayEnd); m += c.slotMinutes) out.push({ time: fmt(m), available: !taken.includes(fmt(m)) });
  return out;
}
export const isValidSlot = (date, time, cfg, taken, now) => slotsFor(date, cfg, taken, now).some((s) => s.time === time && s.available);
