const fetch = require('node-fetch');

/**
 * Search OverDrive/Libby catalog for ebooks.
 * config: { libraryKey: "greenecounty" }
 * Returns: array of result objects (may be empty).
 */
async function search(query, config) {
  const { libraryKey } = config;
  if (!libraryKey) {
    return [{ title: null, author: null, available: false, checkoutUrl: null,
              error: 'Missing libraryKey in OverDrive config' }];
  }

  const url =
    `https://thunder.api.overdrive.com/v2/libraries/${libraryKey}/media` +
    `?query=${encodeURIComponent(query)}&format=ebook-overdrive&perPage=5&page=1&x-client-id=dewey`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; lib_getter/1.0)',
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!res.ok) {
      return [{ title: null, author: null, available: false, checkoutUrl: null,
                error: `OverDrive API returned HTTP ${res.status}` }];
    }

    const data = await res.json();
    const items = (data.items || []);
    if (items.length === 0) return [];

    return items.map(item => {
      const available = !!(item.availability && item.availability.isAvailable);
      return {
        title:       item.title || null,
        author:      item.creators ? item.creators.map(c => c.name).join(', ') : null,
        available,
        checkoutUrl: available
          ? `https://libbyapp.com/library/${libraryKey}/everything/page-1/book/${item.id}`
          : null,
        error: null,
      };
    });

  } catch (err) {
    return [{ title: null, author: null, available: false, checkoutUrl: null, error: err.message }];
  }
}

module.exports = { search };
