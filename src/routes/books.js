const express   = require('express');
const router    = express.Router();
const { addBook, deleteBook, getBook, getBooks } = require('../db');
const { parseLabel } = require('../amazon');
const { scanBook }   = require('../scanner');

// Add a book to the wishlist
router.post('/', (req, res) => {
  const query = (req.body.query || '').trim();
  if (!query) return res.redirect('/');
  addBook({ query, label: parseLabel(query) });
  res.redirect('/');
});

// Scan all books (full page refresh — results visible via individual Scan buttons after)
router.post('/scan-all', async (req, res) => {
  const books = getBooks();
  await Promise.all(books.map(b => scanBook(b.id, b.query)));
  res.redirect('/');
});

// Scan a single book — returns an HTML fragment (used by fetch in dashboard.ejs)
router.post('/:id/scan', async (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return res.status(404).send('<p class="text-red-500 text-sm">Book not found</p>');

  const scanResults = await scanBook(book.id, book.query);

  let html = '<div class="divide-y divide-gray-100">';

  for (const { library, results } of scanResults) {
    if (results.length === 0) {
      html += `
        <div class="flex justify-between items-center text-sm py-2">
          <span class="text-gray-600">${escHtml(library.name)}</span>
          <span class="text-gray-400">Not found</span>
        </div>`;
      continue;
    }

    for (const item of results) {
      if (item.error) {
        html += `
          <div class="flex justify-between items-center text-sm py-2">
            <span class="text-gray-600">${escHtml(library.name)}</span>
            <span class="text-red-400 text-xs">Error: ${escHtml(item.error)}</span>
          </div>`;
      } else {
        const badge = item.available
          ? '<span class="text-green-600 font-medium">Available</span>'
          : '<span class="text-gray-400">Unavailable</span>';
        const link = item.checkoutUrl
          ? ` <a href="${escHtml(item.checkoutUrl)}" target="_blank" rel="noopener"
                 class="text-blue-600 hover:underline text-xs ml-2">Borrow →</a>`
          : '';
        const subtitle = item.title ? ` <span class="text-gray-400 text-xs">— ${escHtml(item.title)}</span>` : '';
        html += `
          <div class="flex justify-between items-center text-sm py-2">
            <span class="text-gray-600">${escHtml(library.name)}${subtitle}</span>
            <span class="shrink-0 ml-4">${badge}${link}</span>
          </div>`;
      }
    }
  }

  html += '</div>';
  res.send(html);
});

// Delete a book
router.post('/:id/delete', (req, res) => {
  deleteBook(req.params.id);
  res.redirect('/');
});

// Minimal HTML escaping for inline HTML construction
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
