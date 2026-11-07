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

  CREATE TABLE IF NOT EXISTS scan_results (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id      INTEGER NOT NULL REFERENCES books(id)     ON DELETE CASCADE,
    library_id   INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL DEFAULT 0,
    format       TEXT,
    title        TEXT,
    author       TEXT,
    available    INTEGER NOT NULL DEFAULT 0,
    checkout_url TEXT,
    holds        INTEGER,
    copies       INTEGER,
    wait_days    INTEGER,
    error        TEXT,
    scanned_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS scan_results_book ON scan_results(book_id, library_id, position);
`);

db.pragma('foreign_keys = ON');

// ── Migrations (SQLite has no ADD COLUMN IF NOT EXISTS) ─────────────────────

function addColumnIfMissing(table, column, definition) {
  const exists = db.pragma(`table_info(${table})`).some(c => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumnIfMissing('books', 'status', "TEXT NOT NULL DEFAULT 'active'");  // active | borrowed | archived
addColumnIfMissing('books', 'format', "TEXT NOT NULL DEFAULT 'ebook'");   // ebook | audiobook | both
addColumnIfMissing('books', 'isbn',   'TEXT');

const BOOK_STATUSES = ['active', 'borrowed', 'archived'];
const BOOK_FORMATS  = ['ebook', 'audiobook', 'both'];

// ── Libraries ────────────────────────────────────────────────────────────────

function getLibraries() {
  return db.prepare('SELECT * FROM libraries ORDER BY name').all();
}

function getLibrary(id) {
  return db.prepare('SELECT * FROM libraries WHERE id = ?').get(id);
}

function getEnabledLibraries() {
  return db.prepare('SELECT * FROM libraries WHERE enabled = 1').all();
}

function addLibrary({ name, adapter_type, config = {} }) {
  return db
    .prepare('INSERT INTO libraries (name, adapter_type, config) VALUES (?, ?, ?)')
    .run(name, adapter_type, JSON.stringify(config));
}

const clearLibraryResults = db.prepare('DELETE FROM scan_results WHERE library_id = ?');
const clearBookResults    = db.prepare('DELETE FROM scan_results WHERE book_id = ?');

// Changing what a library points at invalidates everything it previously returned
const updateLibrary = db.transaction((id, { name, adapter_type, config = {} }) => {
  clearLibraryResults.run(id);
  return db
    .prepare('UPDATE libraries SET name = ?, adapter_type = ?, config = ? WHERE id = ?')
    .run(name, adapter_type, JSON.stringify(config), id);
});

// Results from a disabled library would be stale by the time it's re-enabled
const toggleLibrary = db.transaction((id, enabled) => {
  if (!enabled) clearLibraryResults.run(id);
  return db
    .prepare('UPDATE libraries SET enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, id);
});

function deleteLibrary(id) {
  return db.prepare('DELETE FROM libraries WHERE id = ?').run(id);
}

// ── Books ─────────────────────────────────────────────────────────────────────

// NOTE: ORDER BY relies on created_at being stored as ISO 8601 (lexicographic = chronological)
function getBooks(status) {
  if (status) {
    return db.prepare('SELECT * FROM books WHERE status = ? ORDER BY created_at DESC').all(status);
  }
  return db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
}

function getBook(id) {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id);
}

function addBook({ query, label, isbn = null, format = 'ebook' }) {
  return db
    .prepare('INSERT INTO books (query, label, isbn, format, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(query, label, isbn, format, new Date().toISOString());
}

// A new search term, ISBN or format means the stored results no longer describe this book
const updateBook = db.transaction((id, { query, label, isbn = null, format = 'ebook' }) => {
  const current = getBook(id);
  const searchChanged = !current || current.query !== query || current.isbn !== isbn || current.format !== format;
  if (searchChanged) {
    clearBookResults.run(id);
    db.prepare('UPDATE books SET last_scanned_at = NULL WHERE id = ?').run(id);
  }
  return db
    .prepare('UPDATE books SET query = ?, label = ?, isbn = ?, format = ? WHERE id = ?')
    .run(query, label, isbn, format, id);
});

function setBookStatus(id, status) {
  if (!BOOK_STATUSES.includes(status)) throw new Error(`Invalid book status: ${status}`);
  return db.prepare('UPDATE books SET status = ? WHERE id = ?').run(status, id);
}

function touchBook(id) {
  const now = new Date().toISOString();
  db.prepare('UPDATE books SET last_scanned_at = ? WHERE id = ?').run(now, id);
  return now;
}

function deleteBook(id) {
  return db.prepare('DELETE FROM books WHERE id = ?').run(id);
}

// ── Scan results ─────────────────────────────────────────────────────────────

const insertResult = db.prepare(`
  INSERT INTO scan_results
    (book_id, library_id, position, format, title, author, available, checkout_url, holds, copies, wait_days, error, scanned_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const clearResults = db.prepare('DELETE FROM scan_results WHERE book_id = ? AND library_id = ?');

const NO_MATCH = -1; // position of the marker row stored when a library was searched and had no match

/** Replace the stored results for one book × library with a fresh set. */
const saveScanResults = db.transaction((bookId, libraryId, results, scannedAt) => {
  clearResults.run(bookId, libraryId);
  if (results.length === 0) {
    insertResult.run(bookId, libraryId, NO_MATCH, null, null, null, 0, null, null, null, null, null, scannedAt);
    return;
  }
  results.forEach((r, i) => {
    insertResult.run(
      bookId, libraryId, i, r.format ?? null,
      r.title ?? null, r.author ?? null, r.available ? 1 : 0, r.checkoutUrl ?? null,
      r.holds ?? null, r.copies ?? null, r.waitDays ?? null, r.error ?? null, scannedAt,
    );
  });
});

// Only enabled libraries are scanned, so only their results are current enough to show
function getScanResults(bookId) {
  return db.prepare(`
    SELECT r.*, l.name AS library_name
    FROM scan_results r JOIN libraries l ON l.id = r.library_id
    WHERE r.book_id = ? AND l.enabled = 1
    ORDER BY l.name, r.position
  `).all(bookId).map(rowToResult);
}

/** Results for every book, keyed by book id — one query for the dashboard. */
function getAllScanResults() {
  const rows = db.prepare(`
    SELECT r.*, l.name AS library_name
    FROM scan_results r JOIN libraries l ON l.id = r.library_id
    WHERE l.enabled = 1
    ORDER BY r.book_id, l.name, r.position
  `).all();
  const byBook = {};
  for (const row of rows) (byBook[row.book_id] ||= []).push(rowToResult(row));
  return byBook;
}

function rowToResult(row) {
  return {
    libraryId:   row.library_id,
    libraryName: row.library_name,
    position:    row.position,
    noMatch:     row.position === NO_MATCH,
    format:      row.format,
    title:       row.title,
    author:      row.author,
    available:   !!row.available,
    checkoutUrl: row.checkout_url,
    holds:       row.holds,
    copies:      row.copies,
    waitDays:    row.wait_days,
    error:       row.error,
    scannedAt:   row.scanned_at,
  };
}

module.exports = {
  db,
  BOOK_STATUSES, BOOK_FORMATS,
  getLibraries, getLibrary, getEnabledLibraries, addLibrary, updateLibrary, toggleLibrary, deleteLibrary,
  getBooks, getBook, addBook, updateBook, setBookStatus, touchBook, deleteBook,
  saveScanResults, getScanResults, getAllScanResults,
};
