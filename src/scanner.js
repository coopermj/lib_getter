const { getEnabledLibraries, touchBook } = require('./db');
const { getAdapter, errorResult } = require('./adapters/index');

/**
 * Run all enabled library adapters against a book query in parallel.
 * Updates last_scanned_at on the book record when at least one adapter responds.
 *
 * Returns: { scannedAt: ISO string | null, libraries: Array of { library, results } }
 */
async function scanBook(bookId, query) {
  const libraries = getEnabledLibraries();

  const scanPromises = libraries.map(async (lib) => {
    let adapter;
    try {
      adapter = getAdapter(lib.adapter_type);
    } catch (err) {
      return { library: lib, results: [errorResult(err.message)] };
    }

    try {
      const config  = JSON.parse(lib.config || '{}');
      const results = await adapter.search(query, config);
      return { library: lib, results };
    } catch (err) {
      // Isolate failures so one bad library doesn't fail the whole scan
      return { library: lib, results: [errorResult(err.message)] };
    }
  });

  const scanResults = await Promise.all(scanPromises);

  const anyResponded = scanResults.some(({ results }) => results.every(r => !r.error));
  const scannedAt = anyResponded ? touchBook(bookId) : null;

  return { scannedAt, libraries: scanResults };
}

module.exports = { scanBook };
