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

  if (scanResults.length === 0) {
    return res.send(
      '<div class="book-results fade-up"><p class="empty-state">No libraries configured. ' +
      '<a href="/libraries" style="color:var(--gold);text-decoration:underline;">Add one</a>.</p></div>'
    );
  }

  let html = '<div class="book-results fade-up">';

  for (const { library, results } of scanResults) {
    if (results.length === 0) {
      html += `
        <div class="result-row">
          <span class="result-library">${escHtml(library.name)}</span>
          <span class="badge-unavailable">Not found</span>
        </div>`;
      continue;
    }

    for (const item of results) {
      if (item.error) {
        html += `
          <div class="result-row">
            <span class="result-library">${escHtml(library.name)}</span>
            <span class="badge-error">Error: ${escHtml(item.error)}</span>
          </div>`;
      } else {
        const badge = item.available
          ? '<span class="badge-available">Available</span>'
          : '<span class="badge-unavailable">Unavailable</span>';
        const link = item.checkoutUrl
          ? ` <a href="${escHtml(item.checkoutUrl)}" target="_blank" rel="noopener" class="borrow-link">Borrow →</a>`
          : '';
        const subtitle = item.title
          ? `<div class="result-subtitle">${escHtml(item.title)}</div>` : '';
        html += `
          <div class="result-row">
            <div><span class="result-library">${escHtml(library.name)}</span>${subtitle}</div>
            <div class="result-right">${badge}${link}</div>
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
