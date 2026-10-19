import sqlite3 from 'sqlite3';
export function openDb(file) {
  const db = new sqlite3.Database(file);
  const p = (fn) => (sql, params = []) => new Promise((res, rej) => db[fn](sql, params, function (err, row) { err ? rej(err) : res(fn === 'run' ? { id: this.lastID, changes: this.changes } : row); }));
  const api = { run: p('run'), get: p('get'), all: p('all'), close: () => new Promise((r) => db.close(r)) };
  api.exec = (sql) => new Promise((res, rej) => db.exec(sql, (e) => (e ? rej(e) : res())));
  return api;
}
export const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('owner','customer')), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, password_hash TEXT NOT NULL, created TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, email TEXT, service TEXT, address TEXT, message TEXT, status TEXT DEFAULT 'new', created TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, date TEXT, time TEXT, service TEXT, name TEXT, phone TEXT, email TEXT, notes TEXT, status TEXT DEFAULT 'pending', customer_id INTEGER REFERENCES users(id), created TEXT DEFAULT (datetime('now')));
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings(date, time) WHERE status != 'cancelled';
CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES users(id), title TEXT, lines TEXT, notes TEXT, status TEXT DEFAULT 'draft', created TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES users(id), quote_id INTEGER, title TEXT, amount INTEGER, status TEXT DEFAULT 'unpaid', created TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES users(id), title TEXT, status TEXT DEFAULT 'Scheduled', progress INTEGER DEFAULT 0, notes TEXT, created TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY, job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE, file TEXT, by_role TEXT, created TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES users(id), sender TEXT, body TEXT, created TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT);
`;
