const fetch   = require('node-fetch');
const cheerio = require('cheerio');

/**
 * Generic CSS-selector scraper adapter.
 * config: {
 *   searchUrl:            "https://example.com/search?q={query}",
 *   titleSelector:        ".book-title",
 *   availabilitySelector: ".availability",   // optional
 *   checkoutLinkSelector: "a.checkout-btn"   // optional
 * }
 * Returns: array of result objects.
 */
async function search(query, config) {
  const { searchUrl, titleSelector, availabilitySelector, checkoutLinkSelector } = config;

  if (!searchUrl || !titleSelector) {
    return [{ title: null, author: null, available: false, checkoutUrl: null,
              error: 'Scraper config requires searchUrl and titleSelector' }];
  }

  const url = searchUrl.replace('{query}', encodeURIComponent(query));

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

      const row = $(el).closest('[class]'); // walk up to a containing row

      const availText = availabilitySelector
        ? row.find(availabilitySelector).first().text().trim().toLowerCase()
        : '';
      const available = availText.includes('available') || availText.includes('borrow');

      let checkoutUrl = null;
      if (checkoutLinkSelector) {
        const href = row.find(checkoutLinkSelector).first().attr('href');
        if (href) {
          checkoutUrl = href.startsWith('http') ? href : new URL(url).origin + href;
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
