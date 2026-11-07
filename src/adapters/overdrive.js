const fetch = require('node-fetch');
const { errorResult } = require('./result');

// Verified against the live API (Nov 2026): search items already carry isAvailable,
// availableCopies, ownedCopies, holdsCount and estimatedWaitDays, so no per-item
// availability call is needed. `format` accepts a comma-separated list.
const API_BASE = process.env.OVERDRIVE_API_BASE || 'https://thunder.api.overdrive.com/v2';
const HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (compatible; lib_getter/1.0)',
  'Accept': 'application/json',
};

// Book format → OverDrive media format ids
const FORMAT_IDS = {
  ebook:     ['ebook-overdrive'],
  audiobook: ['audiobook-overdrive'],
  both:      ['ebook-overdrive', 'audiobook-overdrive'],
};

/**
 * Search an OverDrive/Libby catalog.
 * config:  { libraryKey: "ohdbks" }
 * options: { format: "ebook" | "audiobook" | "both" }   (default ebook)
 * Returns: array of result objects (may be empty). Every result carries a Libby URL —
 *          it's the checkout page when available and the place-a-hold page otherwise.
 */
async function search(query, config, options = {}) {
  const { libraryKey } = config;
  if (!libraryKey) {
    return [errorResult('Missing libraryKey in OverDrive config')];
  }

  const formatIds = FORMAT_IDS[options.format] || FORMAT_IDS.ebook;
  const url =
    `${API_BASE}/libraries/${encodeURIComponent(libraryKey)}/media` +
    `?query=${encodeURIComponent(query)}&format=${formatIds.join(',')}&perPage=5&page=1&x-client-id=dewey`;

  try {
    const res = await fetch(url, { headers: HEADERS, timeout: 10000 });
    if (!res.ok) {
      console.log(`[overdrive] search HTTP ${res.status} for ${libraryKey}`);
      return [errorResult(res.status === 404
        ? `OverDrive library "${libraryKey}" not found — check the library key`
        : `OverDrive API returned HTTP ${res.status}`)];
    }

    const data  = await res.json();
    const items = data.items || [];
    console.log(`[overdrive] ${items.length} items for "${query}" (${formatIds.join(',')}) in ${libraryKey}`);

    return items.map(item => ({
      format:      item.type && item.type.id === 'audiobook' ? 'audiobook' : 'ebook',
      title:       item.title || null,
      author:      uniqueNames(item.creators),
      available:   !!item.isAvailable,
      checkoutUrl: `https://libbyapp.com/library/${libraryKey}/everything/page-1/${item.id}`,
      holds:       numberOrNull(item.holdsCount),
      copies:      numberOrNull(item.ownedCopies),
      waitDays:    numberOrNull(item.estimatedWaitDays),
      isbns:       collectIsbns(item),
      error:       null,
    }));
  } catch (err) {
    return [errorResult(err.message)];
  }
}

// Audiobooks list the narrator as a second creator with the same name; dedupe
function uniqueNames(creators) {
  if (!Array.isArray(creators) || creators.length === 0) return null;
  return [...new Set(creators.map(c => c.name).filter(Boolean))].join(', ') || null;
}

function collectIsbns(item) {
  const out = new Set();
  for (const f of item.formats || []) {
    for (const id of f.identifiers || []) {
      if (id.type === 'ISBN' && id.value) out.add(String(id.value));
    }
  }
  return [...out];
}

function numberOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

module.exports = { search };
