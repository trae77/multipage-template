-- D1 schema. Apply with: wrangler d1 execute lead-responder --file=schema.sql
CREATE TABLE IF NOT EXISTS consent (
  client_id TEXT NOT NULL, channel TEXT NOT NULL, address TEXT NOT NULL,
  status TEXT NOT NULL,            -- 'granted' | 'revoked'
  source TEXT, evidence TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY (client_id, channel, address)
);
CREATE TABLE IF NOT EXISTS suppression (
  client_id TEXT NOT NULL, channel TEXT NOT NULL, address TEXT NOT NULL,
  reason TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (client_id, channel, address)
);
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, client_id TEXT,
  kind TEXT NOT NULL, detail TEXT
);
CREATE INDEX IF NOT EXISTS log_client_ts ON log (client_id, ts);
