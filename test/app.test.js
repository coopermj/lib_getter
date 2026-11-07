const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFakeOverDrive, startServer, post } = require('./helpers');

process.env.DB_PATH = ':memory:';
process.env.MASTER_PASSWORD = 'pw';
process.env.LOGIN_MAX_ATTEMPTS = '3';

let od, ol, app, server, base, db, cookie;
const ip = (n) => ({ 'x-forwarded-for': `10.0.0.${n}` }); // app trusts one proxy hop
const auth = () => ({ cookie, ...ip(9) });

before(async () => {
  od = await startFakeOverDrive();
  ol = await startServer((req, res) => {
    const key = new URL(req.url, 'http://x').searchParams.get('bibkeys');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Open Library returns {} for ISBNs it doesn't know
    const body = key === 'ISBN:9780000000002' ? {} : { [key]: { title: 'Atomic Habits', authors: [{ name: 'James Clear' }] } };
    res.end(JSON.stringify(body));
  });
  process.env.OVERDRIVE_API_BASE   = od.url + '/v2';
  process.env.OPENLIBRARY_API_BASE = ol.url;
  db  = require('../src/db');
  app = require('../src/app');
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await od.close(); await ol.close(); });

test('login is rate limited per IP and the limit resets on success', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await post(base, '/login', { password: 'bad' }, ip(1))).status, 200);
  const blocked = await post(base, '/login', { password: 'pw' }, ip(1));
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'));

  const ok = await post(base, '/login', { password: 'pw' }, ip(9));
  assert.equal(ok.status, 302);
  cookie = ok.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  assert.match(ok.headers.get('set-cookie'), /samesite=lax/i);
});

test('unauthenticated: pages redirect, fetch calls get 401', async () => {
  const page = await fetch(base + '/', { redirect: 'manual' });
  assert.equal(page.status, 302);
  const xhr = await fetch(base + '/books/1/scan', { method: 'POST', headers: { 'X-Requested-With': 'fetch' }, redirect: 'manual' });
  assert.equal(xhr.status, 401);
});

test('adding a /gp/product link resolves the ISBN to title + author', async () => {
  const r = await post(base, '/books', { query: 'https://www.amazon.com/gp/product/0735211299', format: 'both' }, auth());
  assert.equal(r.status, 302);
  const book = db.getBook(1);
  assert.equal(book.label, 'Atomic Habits');
  assert.equal(book.query, 'Atomic Habits James Clear');
  assert.equal(book.isbn, '9780735211292', 'stored as ISBN-13');
  assert.equal(new URL(ol.requests[0].url, 'http://x').searchParams.get('bibkeys'), 'ISBN:9780735211292');
  assert.equal(book.format, 'both');
});

test('a bare ISBN that Open Library does not know is rejected, not saved', async () => {
  const before = db.getBooks().length;
  const r = await post(base, '/books', { query: '978-0-00-000000-2' }, auth());
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Couldn&#39;t find ISBN 9780000000002/);
  assert.equal(db.getBooks().length, before);
});

test('adding an unparseable link is rejected with a message', async () => {
  const r = await post(base, '/books', { query: 'https://example.com/whatever' }, auth());
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Couldn&#39;t read a title/);
});

test('library validation, add, edit', async () => {
  assert.equal((await post(base, '/libraries', { name: '', adapter_type: 'overdrive', libraryKey: 'x' }, auth())).status, 400);
  assert.equal((await post(base, '/libraries', { name: 'Ohio', adapter_type: 'overdrive', libraryKey: 'ohdbks' }, auth())).status, 302);
  assert.equal((await post(base, '/libraries/1/edit', { name: 'Ohio DL', adapter_type: 'overdrive', libraryKey: 'ohdbks' }, auth())).status, 302);
  assert.equal(db.getLibrary(1).name, 'Ohio DL');
  const page = await (await fetch(base + '/libraries/1/edit', { headers: auth() })).text();
  assert.match(page, /value="ohdbks"/);
});

test('scan returns a fragment with best match + folded extras, and the dashboard shows stored results', async () => {
  const r = await fetch(base + '/books/1/scan', { method: 'POST', headers: auth() });
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('x-scanned-at'));
  const frag = await r.text();
  assert.match(frag, /badge-available/);
  assert.match(frag, /2 more matches at Ohio DL/);
  assert.match(frag, /Place hold →/);
  assert.match(frag, /49 holds/);

  const dash = await (await fetch(base + '/', { headers: auth() })).text();
  assert.match(dash, /has-available/);
  assert.match(dash, /result-row/);
  assert.match(dash, /tab-active/);
});

test('a library with no match still shows as "Not found" after reload', async () => {
  const { lastInsertRowid: id } = db.addBook({ query: 'nothing', label: 'Nothing', format: 'ebook' });
  await fetch(base + `/books/${id}/scan`, { method: 'POST', headers: auth() });
  const dash = await (await fetch(base + '/', { headers: auth() })).text();
  const start = dash.indexOf(`id="book-${id}"`);
  assert.ok(start > -1, 'book card is rendered');
  assert.match(dash.slice(start, start + 3000), /Ohio DL[\s\S]{0,200}Not found/);
  db.deleteBook(id);
});

test('status moves between tabs; edit validates ISBN', async () => {
  assert.equal((await post(base, '/books/1/status', { status: 'borrowed' }, auth())).status, 302);
  assert.equal(db.getBook(1).status, 'borrowed');
  assert.equal((await post(base, '/books/1/status', { status: 'bogus' }, auth())).status, 400);
  const tab = await (await fetch(base + '/?status=borrowed', { headers: auth() })).text();
  assert.match(tab, /Back to wishlist/);

  assert.equal((await post(base, '/books/1/edit', { label: 'AH', query: 'x', isbn: 'junk', format: 'ebook' }, auth())).status, 400);
  assert.equal((await post(base, '/books/1/edit', { label: 'AH', query: '', isbn: '978-0735211292', format: 'audiobook' }, auth())).status, 302);
  const b = db.getBook(1);
  assert.deepEqual([b.label, b.query, b.isbn, b.format], ['AH', 'AH', '9780735211292', 'audiobook']);
});

test('the back field only redirects within the app', async () => {
  const evil = await post(base, '/books/1/status', { status: 'active', back: 'https://evil.example/' }, auth());
  assert.equal(evil.headers.get('location'), '/');
  const proto = await post(base, '/books/1/status', { status: 'active', back: '//evil.example/' }, auth());
  assert.equal(proto.headers.get('location'), '/');
  const ok = await post(base, '/books/1/status', { status: 'borrowed', back: '/?status=active' }, auth());
  assert.equal(ok.headers.get('location'), '/?status=active');
});

test('deleting a book removes its stored results', async () => {
  assert.equal((await post(base, '/books/1/delete', {}, auth())).status, 302);
  assert.equal(db.getScanResults(1).length, 0);
});
