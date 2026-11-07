/**
 * Turn whatever the user pasted into a search label and, when possible, an ISBN.
 *
 * Amazon:    https://www.amazon.com/Atomic-Habits-James-Clear/dp/0735211299  → { label: "Atomic Habits James Clear", isbn: "0735211299" }
 *            https://www.amazon.com/gp/product/0735211299                   → { label: null, isbn: "0735211299" }
 * Goodreads: https://www.goodreads.com/book/show/40121378-atomic-habits       → { label: "atomic habits", isbn: null }
 * Bare ISBN: 9780735211292                                                   → { label: "9780735211292", isbn: "9780735211292" }
 * Anything else is returned as the label unchanged.
 */

const ISBN10 = /^\d{9}[\dX]$/i;
const ISBN13 = /^97[89]\d{10}$/;

function normalizeIsbn(str) {
  if (!str) return null;
  const s = String(str).replace(/[-\s]/g, '').toUpperCase();
  return ISBN10.test(s) || ISBN13.test(s) ? s : null;
}

function parseInput(input) {
  input = input.trim();

  const bare = normalizeIsbn(input);
  if (bare) return { label: bare, isbn: bare };

  try {
    const url = new URL(input);

    if (url.hostname.includes('amazon.')) {
      // ASIN follows /dp/ or /gp/product/; it's an ISBN-10 for most print/Kindle-of-print titles
      const asinMatch = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
      const isbn = asinMatch ? normalizeIsbn(asinMatch[1]) : null;

      // Slug before /dp/ carries the title — reject if the segment before /dp/ is itself "dp"
      const slugMatch = url.pathname.match(/^\/(.+?)\/dp\//);
      const label = slugMatch && slugMatch[1] !== 'dp' ? slugMatch[1].replace(/-/g, ' ') : null;

      if (label || isbn) return { label, isbn };
    }

    if (url.hostname.includes('goodreads.com')) {
      // Patterns: /book/show/{id}-{title-slug}  or  /book/show/{id}.{Title_With_Underscores}
      const match = url.pathname.match(/\/book\/show\/\d+[-.]([^/]+)/);
      if (match) {
        return { label: decodeURIComponent(match[1]).replace(/[-_]+/g, ' ').trim(), isbn: null };
      }
    }
  } catch (_) {
    // not a URL — fall through
  }
  return { label: input, isbn: null };
}

/** Back-compat helper: just the label (or the raw input when nothing could be parsed). */
function parseLabel(input) {
  return parseInput(input).label ?? input.trim();
}

module.exports = { parseInput, parseLabel, normalizeIsbn };
