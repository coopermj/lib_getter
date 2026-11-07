const db = require('../db');

/** Stored results for one book → [{ libraryName, results }] in the shape the _results partial takes. */
function groupStoredResults(rows = []) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.libraryId)) groups.set(r.libraryId, { libraryName: r.libraryName, results: [] });
    groups.get(r.libraryId).results.push(r);
  }
  return Array.from(groups.values());
}

/** Everything the dashboard template needs for a given status tab. */
function dashboardLocals({ status = 'active', error = null } = {}) {
  if (!db.BOOK_STATUSES.includes(status)) status = 'active';
  const allResults = db.getAllScanResults();
  const books = db.getBooks(status).map(book => {
    const groups = groupStoredResults(allResults[book.id]);
    return {
      ...book,
      groups,
      hasAvailable: groups.some(g => g.results.some(r => r.available)),
    };
  });
  const counts = Object.fromEntries(db.BOOK_STATUSES.map(s => [s, db.getBooks(s).length]));
  return { books, status, counts, error, formats: db.BOOK_FORMATS };
}

module.exports = { dashboardLocals, groupStoredResults };
