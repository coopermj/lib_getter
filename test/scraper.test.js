const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');
const scraper = require('../src/adapters/scraper');

const PAGE = `
<ul>
  <li class="result-item"><h3 class="book-title">Dune</h3><span class="availability">Available now</span><a class="checkout-btn" href="item/42">Borrow</a></li>
  <li class="result-item"><h3 class="book-title">Emma</h3><span class="availability">Checked out</span><a class="checkout-btn" href="javascript:alert(1)">x</a></li>
</ul>`;

let server, base;
before(async () => {
  server = await startServer((req, res) => {
    if (req.url.startsWith('/missing')) { res.writeHead(500); return res.end('boom'); }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE);
  });
  base = server.url;
});
after(() => server.close());

const cfg = (extra = {}) => ({
  searchUrl: `${base}/search/?q={query}`,
  titleSelector: '.book-title',
  availabilitySelector: '.availability',
  checkoutLinkSelector: 'a.checkout-btn',
  ...extra,
});

test('finds titles, availability and resolves relative checkout links', async () => {
  const results = await scraper.search('dune', cfg());
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'Dune');
  assert.equal(results[0].available, true);
  assert.equal(results[0].checkoutUrl, `${base}/search/item/42`);
  assert.equal(results[1].available, false);
  assert.equal(results[1].checkoutUrl, null, 'javascript: hrefs are dropped');
});

test('explicit rowSelector works; a non-matching one is reported', async () => {
  const ok = await scraper.search('dune', cfg({ rowSelector: '.result-item' }));
  assert.equal(ok[0].available, true);

  const bad = await scraper.search('dune', cfg({ rowSelector: '.nope' }));
  assert.equal(bad.length, 1);
  assert.match(bad[0].error, /rowSelector/);
});

test('query is URL-encoded into every {query} placeholder', async () => {
  await scraper.search('a b&c', cfg({ searchUrl: `${base}/search/?q={query}&again={query}` }));
  const last = server.requests.at(-1);
  assert.equal(last.url, '/search/?q=a%20b%26c&again=a%20b%26c');
});

test('HTTP errors and missing config come back as error rows', async () => {
  const [err] = await scraper.search('x', cfg({ searchUrl: `${base}/missing?q={query}` }));
  assert.match(err.error, /HTTP 500/);
  const [cfgErr] = await scraper.search('x', { searchUrl: base });
  assert.match(cfgErr.error, /titleSelector/);
});
