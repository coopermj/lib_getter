const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseInput, parseLabel, normalizeIsbn } = require('../src/amazon');

test('Amazon product URL with slug → title + ISBN', () => {
  assert.deepEqual(
    parseInput('https://www.amazon.com/Atomic-Habits-James-Clear/dp/0735211299/ref=sr_1_1?crid=X'),
    { label: 'Atomic Habits James Clear', isbn: '9780735211292' },
  );
});

test('Amazon /gp/product URL → ISBN only', () => {
  assert.deepEqual(parseInput('https://www.amazon.com/gp/product/0735211299'), { label: null, isbn: '9780735211292' });
});

test('Amazon Kindle ASIN (not an ISBN) → slug only', () => {
  assert.deepEqual(
    parseInput('https://www.amazon.com/Atomic-Habits-ebook/dp/B07D23CFGR'),
    { label: 'Atomic Habits ebook', isbn: null },
  );
});

test('Goodreads dash and dot/underscore formats', () => {
  assert.equal(parseLabel('https://www.goodreads.com/book/show/40121378-atomic-habits'), 'atomic habits');
  assert.equal(parseLabel('https://www.goodreads.com/book/show/40121378.Atomic_Habits?ref=x'), 'Atomic Habits');
});

test('bare ISBN-10/13 with hyphens', () => {
  assert.deepEqual(parseInput('978-0-7352-1129-2'), { label: 'ISBN 9780735211292', isbn: '9780735211292' });
  assert.deepEqual(parseInput('0735211299'), { label: 'ISBN 9780735211292', isbn: '9780735211292' }, 'ISBN-10 is converted to ISBN-13');
  assert.equal(normalizeIsbn('080442957X'), '9780804429573', 'X check digit');
});

test('plain text passes through; unknown URL is returned as-is', () => {
  assert.deepEqual(parseInput('  Dune  '), { label: 'Dune', isbn: null });
  assert.equal(parseLabel('https://example.com/some/book'), 'https://example.com/some/book');
});

test('normalizeIsbn rejects junk', () => {
  assert.equal(normalizeIsbn('12345'), null);
  assert.equal(normalizeIsbn('9770735211292'), null); // bad prefix
});
