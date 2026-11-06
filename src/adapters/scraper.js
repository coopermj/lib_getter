const fetch   = require('node-fetch');
const cheerio = require('cheerio');

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
    return [{ title: null, author: null, available: false, checkoutUrl: null,
              error: 'Scraper config requires searchUrl and titleSelector' }];
  }

  const url = searchUrl.replaceAll('{query}', encodeURIComponent(query));

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; lib_getter/1.0)' },
      timeout: 10000,
    });

    if (!res.ok) {
      return [{ title: null, author: null, available: false, checkoutUrl: null,
                error: `Scraper got HTTP ${res.status} from ${url}` }];
    }

    const html = await res.text();
    const $    = cheerio.load(html);

    const results = [];

    $(titleSelector).each((_, el) => {
      const title = $(el).text().trim() || null;

      // Containing row: explicit selector, else the nearest classed ancestor
      // (starting at the parent so the title element itself never counts as the row)
      const row = rowSelector ? $(el).closest(rowSelector) : $(el).parent().closest('[class]');

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

    return results;

  } catch (err) {
    return [{ title: null, author: null, available: false, checkoutUrl: null, error: err.message }];
  }
}

module.exports = { search };
