const fetch = require('node-fetch');

const API_BASE = process.env.OPENLIBRARY_API_BASE || 'https://openlibrary.org';

/**
 * Resolve an ISBN to { title, authors: [names] } via Open Library.
 * Returns null when the ISBN is unknown or the lookup fails — callers fall back
 * to whatever label they already have. Authors are frequently missing.
 * The timeout is short because this runs inside the Add-book request.
 */
async function lookupIsbn(isbn) {
  const key = `ISBN:${isbn}`;
  const url = `${API_BASE}/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, timeout: 3000 });
    if (!res.ok) return null;
    const data = await res.json();
    const book = data[key];
    if (!book || !book.title) return null;
    return {
      title:   book.title,
      authors: (book.authors || []).map(a => a.name).filter(Boolean),
    };
  } catch (err) {
    console.log(`[isbn] lookup failed for ${isbn}: ${err.message}`);
    return null;
  }
}

module.exports = { lookupIsbn };
