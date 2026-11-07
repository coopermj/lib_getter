const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const { parseInput, normalizeIsbn } = require('../amazon');
const { scanBook } = require('../scanner');
const { lookupIsbn } = require('../isbn');
const { dashboardLocals } = require('./dashboard');

// Add a book to the wishlist
router.post('/', async (req, res) => {
  const raw = (req.body.query || '').trim();
  if (!raw) return res.redirect('/');

  // Search with the parsed title, not the raw URL — library catalogs can't match a URL
  let { label, isbn } = parseInput(raw);
  if (label && isUrl(label)) label = null; // a link we couldn't parse is not a title
  let query = label;

  // An ISBN gives us a canonical title and author — better than an Amazon slug,
  // and the only option for links that carry no title at all (/gp/product/…)
  if (isbn) {
    const found = await lookupIsbn(isbn);
    if (found) {
      label = found.title;
      query = found.authors.length ? `${found.title} ${found.authors[0]}` : found.title;
    }
  }

  if (!label) {
    return res.status(400).render('dashboard', dashboardLocals({
      status: 'active',
      error: isbn
        ? `Couldn't find ISBN ${isbn}. Type the title instead.`
        : 'Couldn\'t read a title from that link. Paste an Amazon product link, a Goodreads link, an ISBN, or type the title.',
    }));
  }

  const format = db.BOOK_FORMATS.includes(req.body.format) ? req.body.format : 'ebook';
  db.addBook({ query, label, isbn, format });
  res.redirect('/');
});

// Edit form
router.get('/:id/edit', (req, res) => {
  const book = db.getBook(req.params.id);
  if (!book) return res.status(404).send('Book not found');
  res.render('book_edit', { book, formats: db.BOOK_FORMATS, error: null });
});

// Save edits — label, search term, ISBN and format are all independently editable
router.post('/:id/edit', (req, res) => {
  const book = db.getBook(req.params.id);
  if (!book) return res.status(404).send('Book not found');

  const label  = (req.body.label || '').trim();
  const query  = (req.body.query || '').trim() || label;
  const isbnIn = (req.body.isbn  || '').trim();
  const isbn   = isbnIn ? normalizeIsbn(isbnIn) : null;
  const format = db.BOOK_FORMATS.includes(req.body.format) ? req.body.format : 'ebook';

  if (!label) {
    return res.status(400).render('book_edit', { book: { ...book, ...req.body }, formats: db.BOOK_FORMATS, error: 'Title is required.' });
  }
  if (isbnIn && !isbn) {
    return res.status(400).render('book_edit', { book: { ...book, ...req.body }, formats: db.BOOK_FORMATS, error: 'That doesn\'t look like a valid ISBN-10 or ISBN-13.' });
  }

  db.updateBook(book.id, { label, query, isbn, format });
  res.redirect('/');
});

// Scan a single book — returns an HTML fragment (used by fetch in dashboard.ejs)
router.post('/:id/scan', async (req, res) => {
  const book = db.getBook(req.params.id);
  if (!book) return res.status(404).send('<p class="text-red-500 text-sm">Book not found</p>');

  const { scannedAt, libraries } = await scanBook(book);
  if (scannedAt) res.set('X-Scanned-At', scannedAt);

  const groups = libraries.map(({ library, results }) => ({ libraryName: library.name, results }));
  res.render('_results', { groups });
});

// Move between wishlist / borrowed / archived
router.post('/:id/status', (req, res) => {
  const status = req.body.status;
  if (!db.BOOK_STATUSES.includes(status)) return res.status(400).send('Invalid status');
  db.setBookStatus(req.params.id, status);
  res.redirect(localPath(req.body.back));
});

// Delete a book
router.post('/:id/delete', (req, res) => {
  db.deleteBook(req.params.id);
  res.redirect(localPath(req.body.back));
});

// Only redirect within the app — a `back` value like https://evil.example or //evil.example is ignored
function localPath(str) {
  return typeof str === 'string' && /^\/(?![\/\\])/.test(str) ? str : '/';
}

function isUrl(str) {
  try { return ['http:', 'https:'].includes(new URL(str).protocol); } catch (_) { return false; }
}

module.exports = router;
