const fetch   = require('node-fetch');
const cheerio = require('cheerio');
const { errorResult } = require('./result');

/**
 * Generic CSS-selector scraper adapter.
 * config: {
 *   searchUrl:            "https://example.com/search?q={query}",
 *   titleSelector:        ".book-title",
 *   rowSelector:          ".result-item",    // optional; container for one result
 *   availabilitySelector: ".availability",   // optional
 *   checkoutLinkSelector: "a.checkout-btn"   // optional
 * }
 * Returns: array of result objects.
 */
async function search(query, config) {
  const { searchUrl, titleSelector, rowSelector, availabilitySelector, checkoutLinkSelector } = config;

  if (!searchUrl || !titleSelector) {
    return [errorResult('Scraper config requires searchUrl and titleSelector')];
  }

  const url = searchUrl.replaceAll('{query}', encodeURIComponent(query));

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; lib_getter/1.0)' },
      timeout: 10000,
    });

    if (!res.ok) {
      return [errorResult(`Scraper got HTTP ${res.status} from ${url}`)];
    }

    const html = await res.text();
    const $    = cheerio.load(html);

    const results = [];
    let rowMissing = false;

    $(titleSelector).each((_, el) => {
      const title = $(el).text().trim() || null;

      // Containing row: explicit selector, else the nearest classed ancestor
      // (starting at the parent so the title element itself never counts as the row)
      const row = rowSelector ? $(el).closest(rowSelector) : $(el).parent().closest('[class]');
      if (rowSelector && row.length === 0) { rowMissing = true; return false; }

      const availText = availabilitySelector
        ? row.find(availabilitySelector).first().text().trim().toLowerCase()
        : '';
      const available = availText.includes('available') || availText.includes('borrow');

      let checkoutUrl = null;
      if (checkoutLinkSelector) {
        const href = row.find(checkoutLinkSelector).first().attr('href');
        if (href) {
          try {
            const resolved = new URL(href, url);
            if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
              checkoutUrl = resolved.href;
            }
          } catch (_) { /* unparseable href — leave null */ }
        }
      }

      results.push({ title, author: null, available, checkoutUrl, error: null });
    });

    if (rowMissing) {
      return [errorResult(`rowSelector "${rowSelector}" matched no ancestor of a title — check the selector`)];
    }

    return results;

  } catch (err) {
    return [errorResult(err.message)];
  }
}

module.exports = { search };
