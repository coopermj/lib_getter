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

    // OverDrive search never includes availability — fetch it separately for each item
    const availabilities = await Promise.all(items.map(async item => {
      try {
        const avUrl =
          `https://thunder.api.overdrive.com/v2/libraries/${libraryKey}/media/${item.id}/availability` +
          `?x-client-id=dewey`;
        const avRes = await fetch(avUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; lib_getter/1.0)',
            'Accept': 'application/json',
          },
          timeout: 10000,
        });
        if (!avRes.ok) return null;
        return await avRes.json();
      } catch (_) {
        return null;
      }
    }));

    return items.map((item, i) => {
      const av = availabilities[i];
      const available = !!(av && av.isAvailable);
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
