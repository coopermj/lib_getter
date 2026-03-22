/**
 * Given a raw input string, return a human-friendly label.
 * Handles Amazon and Goodreads URLs; otherwise returns input as-is.
 *
 * Amazon:    https://www.amazon.com/Atomic-Habits-James-Clear/dp/0735211299  → "Atomic Habits James Clear"
 * Goodreads: https://www.goodreads.com/book/show/40121378-atomic-habits       → "atomic habits"
 */
function parseLabel(input) {
  input = input.trim();
  try {
    const url = new URL(input);

    if (url.hostname.includes('amazon.')) {
      // Match slug before /dp/ — reject if the segment before /dp/ is itself "dp"
      const match = url.pathname.match(/^\/(.+?)\/dp\//);
      if (match && match[1] !== 'dp') {
        return match[1].replace(/-/g, ' ');
      }
    }

    if (url.hostname.includes('goodreads.com')) {
      // Pattern: /book/show/{numeric-id}-{title-slug}
      const match = url.pathname.match(/\/book\/show\/\d+-(.+)/);
      if (match) {
        return match[1].replace(/-/g, ' ');
      }
    }
  } catch (_) {
    // not a URL — fall through
  }
  return input;
}

module.exports = { parseLabel };
