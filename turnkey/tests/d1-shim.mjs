import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../worker/migrations/0001_leads.sql', import.meta.url), 'utf8'));
  return { _db: db, prepare(sql) { let args = []; const st = db.prepare(sql);
    const api = { bind(...a) { args = a; return api; }, first: async () => st.get(...args) ?? null, run: async () => { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; }, all: async () => ({ results: st.all(...args) }) };
    return api; } };
}
