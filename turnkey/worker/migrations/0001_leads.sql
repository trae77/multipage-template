-- Turnkey client D1 schema (free tier). Apply: wrangler d1 migrations apply <client>-preview --remote (only with William's OK).
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'routine',
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, service TEXT, details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
CREATE TABLE IF NOT EXISTS lead_rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
