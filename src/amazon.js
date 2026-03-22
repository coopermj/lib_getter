/**
 * Given a raw input string, return a human-friendly label.
 * If it looks like an Amazon URL with a title slug, extract it.
 * Otherwise, return the input as-is.
 *
 * Amazon URL patterns:
 *   https://www.amazon.com/Atomic-Habits-James-Clear/dp/0735211299  → "Atomic Habits James Clear"
 *   https://www.amazon.com/dp/0735211299                            → raw input (no slug)
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
  } catch (_) {
    // not a URL — fall through
  }
  return input;
}

module.exports = { parseLabel };
