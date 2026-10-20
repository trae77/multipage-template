import { now } from './util.js';

// Same interface for D1 (production) and memory (tests / local).
export class MemoryStore {
  constructor() { this.consent = new Map(); this.supp = new Map(); this.logs = []; }
  k(c, ch, a) { return `${c}|${ch}|${a}`; }
  async setConsent(client_id, channel, address, status, source, evidence) {
    this.consent.set(this.k(client_id, channel, address), { status, source, evidence, updated_at: now() });
  }
  async getConsent(client_id, channel, address) { return this.consent.get(this.k(client_id, channel, address))?.status || null; }
  async suppress(client_id, channel, address, reason) { this.supp.set(this.k(client_id, channel, address), { reason, created_at: now() }); }
  async unsuppress(client_id, channel, address) { this.supp.delete(this.k(client_id, channel, address)); }
  async isSuppressed(client_id, channel, address) { return this.supp.has(this.k(client_id, channel, address)); }
  async log(client_id, kind, detail) { this.logs.push({ ts: now(), client_id, kind, detail }); }
}

export class D1Store {
  constructor(db) { this.db = db; }
  async setConsent(client_id, channel, address, status, source, evidence) {
    await this.db.prepare(`INSERT INTO consent (client_id,channel,address,status,source,evidence,updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(client_id,channel,address) DO UPDATE SET status=excluded.status, source=excluded.source, evidence=excluded.evidence, updated_at=excluded.updated_at`)
      .bind(client_id, channel, address, status, source || null, evidence ? JSON.stringify(evidence) : null, now()).run();
  }
  async getConsent(client_id, channel, address) {
    const r = await this.db.prepare('SELECT status FROM consent WHERE client_id=? AND channel=? AND address=?').bind(client_id, channel, address).first();
    return r ? r.status : null;
  }
  async suppress(client_id, channel, address, reason) {
    await this.db.prepare('INSERT OR REPLACE INTO suppression (client_id,channel,address,reason,created_at) VALUES (?,?,?,?,?)').bind(client_id, channel, address, reason || null, now()).run();
  }
  async unsuppress(client_id, channel, address) {
    await this.db.prepare('DELETE FROM suppression WHERE client_id=? AND channel=? AND address=?').bind(client_id, channel, address).run();
  }
  async isSuppressed(client_id, channel, address) {
    return !!(await this.db.prepare('SELECT 1 AS x FROM suppression WHERE client_id=? AND channel=? AND address=?').bind(client_id, channel, address).first());
  }
  async log(client_id, kind, detail) {
    console.log(JSON.stringify({ client_id, kind, detail }));
    await this.db.prepare('INSERT INTO log (ts,client_id,kind,detail) VALUES (?,?,?,?)').bind(now(), client_id, kind, JSON.stringify(detail ?? null)).run();
  }
}
