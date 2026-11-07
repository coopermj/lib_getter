const db = require('./db');
const { getAdapter, errorResult } = require('./adapters/index');
const { notifyAvailable } = require('./notify');

/**
 * Run all enabled library adapters against a book in parallel, persist the results,
 * and notify when a library flips from unavailable to available.
 *
 * Returns: {
 *   scannedAt:      ISO string when at least one library responded, else null,
 *   libraries:      Array of { library, results },
 *   newlyAvailable: Array of library names that just became available
 * }
 */
async function scanBook(book) {
  const libraries = db.getEnabledLibraries();
  const previous  = db.getScanResults(book.id);

  const scanResults = await Promise.all(libraries.map(lib => scanLibrary(book, lib)));

  const anyResponded = scanResults.some(({ results }) => results.every(r => !r.error));
  const scannedAt    = anyResponded ? db.touchBook(book.id) : null;
  const newlyAvailable = [];

  for (const { library, results } of scanResults) {
    // Keep the last good results when a library errored this time, so a blip doesn't wipe the card
    const errored = results.length > 0 && results.every(r => r.error);
    if (!errored) db.saveScanResults(book.id, library.id, results, scannedAt || new Date().toISOString());

    const wasAvailable = previous.some(r => r.libraryId === library.id && r.available);
    const nowResult    = results.find(r => r.available);
    if (!wasAvailable && nowResult && book.status === 'active') {
      newlyAvailable.push(library.name);
      // Fire-and-forget: a slow notifier shouldn't hold the scan response
      notifyAvailable({ book, libraryName: library.name, result: nowResult })
        .catch(err => console.error(`[notify] ${err.message}`));
    }
  }

  return { scannedAt, libraries: scanResults, newlyAvailable };
}

async function scanLibrary(book, lib) {
  let adapter;
  try {
    adapter = getAdapter(lib.adapter_type);
  } catch (err) {
    return { library: lib, results: [errorResult(err.message)] };
  }

  try {
    const config  = JSON.parse(lib.config || '{}');
    const options = { format: book.format || 'ebook' };

    const results = await adapter.search(book.query, config, options);
    return { library: lib, results: preferIsbnMatch(results, book.isbn) };
  } catch (err) {
    // Isolate failures so one bad library doesn't fail the whole scan
    return { library: lib, results: [errorResult(err.message)] };
  }
}

/**
 * Catalog searches can't filter by ISBN (verified against OverDrive), but results
 * report their own ISBNs — so when one matches the book's, move it to the front
 * so it's the "best match" the dashboard shows first.
 */
function preferIsbnMatch(results, isbn) {
  if (!isbn) return results;
  const i = results.findIndex(r => Array.isArray(r.isbns) && r.isbns.includes(isbn));
  if (i <= 0) return results;
  return [results[i], ...results.slice(0, i), ...results.slice(i + 1)];
}

/** Scan every active book, a couple at a time. Used by the background scheduler. */
async function scanAllActiveBooks({ concurrency = 2 } = {}) {
  const queue = db.getBooks('active');
  let newlyAvailable = 0;
  const worker = async () => {
    while (queue.length) {
      const book = queue.shift();
      try {
        const r = await scanBook(book);
        newlyAvailable += r.newlyAvailable.length;
      } catch (err) {
        console.error(`[scheduler] scan failed for book ${book.id}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { scanned: db.getBooks('active').length, newlyAvailable };
}

module.exports = { scanBook, scanAllActiveBooks };
