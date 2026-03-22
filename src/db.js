const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'dev.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS libraries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    adapter_type TEXT    NOT NULL,
    config       TEXT    NOT NULL DEFAULT '{}',
    enabled      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS books (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    query           TEXT NOT NULL,
    label           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    last_scanned_at TEXT
  );
`);

// ── Libraries ────────────────────────────────────────────────────────────────

function getLibraries() {
  return db.prepare('SELECT * FROM libraries ORDER BY name').all();
}

function getEnabledLibraries() {
  return db.prepare('SELECT * FROM libraries WHERE enabled = 1').all();
}

function addLibrary({ name, adapter_type, config }) {
  return db
    .prepare('INSERT INTO libraries (name, adapter_type, config) VALUES (?, ?, ?)')
    .run(name, adapter_type, JSON.stringify(config));
}

function toggleLibrary(id, enabled) {
  return db
    .prepare('UPDATE libraries SET enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, id);
}

function deleteLibrary(id) {
  return db.prepare('DELETE FROM libraries WHERE id = ?').run(id);
}

// ── Books ─────────────────────────────────────────────────────────────────────

function getBooks() {
  return db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
}

function getBook(id) {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id);
}

function addBook({ query, label }) {
  return db
    .prepare('INSERT INTO books (query, label, created_at) VALUES (?, ?, ?)')
    .run(query, label, new Date().toISOString());
}

function touchBook(id) {
  return db
    .prepare('UPDATE books SET last_scanned_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

function deleteBook(id) {
  return db.prepare('DELETE FROM books WHERE id = ?').run(id);
}

module.exports = {
  getLibraries, getEnabledLibraries, addLibrary, toggleLibrary, deleteLibrary,
  getBooks, getBook, addBook, touchBook, deleteBook,
};
