const { getEnabledLibraries, touchBook } = require('./db');
const { getAdapter } = require('./adapters/index');

/**
 * Run all enabled library adapters against a book query in parallel.
 * Updates last_scanned_at on the book record when at least one adapter responds.
 *
 * Returns: Array of { library: { id, name, ... }, results: [...] }
 */
async function scanBook(bookId, query) {
  const libraries = getEnabledLibraries();

  const scanPromises = libraries.map(async (lib) => {
    let adapter;
    try {
      adapter = getAdapter(lib.adapter_type);
    } catch (err) {
      return {
        library: lib,
        results: [{ title: null, author: null, available: false, checkoutUrl: null, error: err.message }],
      };
    }

    const config  = JSON.parse(lib.config || '{}');
    const results = await adapter.search(query, config);
    return { library: lib, results };
  });

  const scanResults = await Promise.all(scanPromises);

  if (scanResults.length > 0) touchBook(bookId);

  return scanResults;
}

module.exports = { scanBook };
