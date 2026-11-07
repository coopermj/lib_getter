const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFakeOverDrive, startServer } = require('./helpers');

process.env.DB_PATH = ':memory:';

let od, ntfy, db, scanner, available = true;
before(async () => {
  od = await startFakeOverDrive({
    transform: data => { data.items[0].isAvailable = available; return data; },
  });
  ntfy = await startServer((req, res) => { res.writeHead(200); res.end('{}'); });
  process.env.OVERDRIVE_API_BASE = od.url + '/v2';
  process.env.NTFY_URL   = ntfy.url;
  process.env.NTFY_TOPIC = 'lib-test';
  db      = require('../src/db');
  scanner = require('../src/scanner');
});
after(async () => { await od.close(); await ntfy.close(); });

const settle = () => new Promise(r => setTimeout(r, 50)); // let fire-and-forget notifications land

test('persists results, touches the book, and notifies on unavailable → available', async () => {
  db.addLibrary({ name: 'Ohio', adapter_type: 'overdrive', config: { libraryKey: 'ohdbks' } });
  db.addBook({ query: 'atomic habits', label: 'Atomic Habits', format: 'both' });
  const book = db.getBook(1);

  // First scan: unavailable → nothing to notify
  available = false;
  let r = await scanner.scanBook(book);
  await settle();
  assert.ok(r.scannedAt);
  assert.equal(db.getScanResults(1).length, 3);
  assert.deepEqual(r.newlyAvailable, []);
  assert.equal(ntfy.requests.length, 0);

  // Second scan: flips to available → one ntfy push with title + click URL
  available = true;
  r = await scanner.scanBook(book);
  await settle();
  assert.deepEqual(r.newlyAvailable, ['Ohio']);
  assert.equal(ntfy.requests.length, 1);
  const n = ntfy.requests[0];
  assert.equal(n.url, '/lib-test');
  assert.match(n.headers.title, /Available: Atomic Habits/);
  assert.match(n.headers.click, /libbyapp\.com/);
  assert.match(n.body, /audiobook/);

  // Third scan: still available → no repeat notification
  r = await scanner.scanBook(book);
  await settle();
  assert.deepEqual(r.newlyAvailable, []);
  assert.equal(ntfy.requests.length, 1);
});

test('does not notify for books that are not active', async () => {
  db.addBook({ query: 'atomic habits', label: 'Later', format: 'ebook' });
  db.setBookStatus(2, 'archived');
  const r = await scanner.scanBook(db.getBook(2));
  await settle();
  assert.deepEqual(r.newlyAvailable, []);
  assert.equal(ntfy.requests.length, 1);
});

test('a library error keeps the previous good results and does not touch the book', async () => {
  const before = db.getScanResults(1);
  db.addLibrary({ name: 'Broken', adapter_type: 'overdrive', config: { libraryKey: 'nope' } });
  const r = await scanner.scanBook(db.getBook(1));
  const broken = r.libraries.find(l => l.library.name === 'Broken');
  assert.match(broken.results[0].error, /not found/);
  assert.ok(r.scannedAt, 'the healthy library still responded');
  assert.equal(db.getScanResults(1).length, before.length, 'nothing stored for the broken library');
});

test('a result carrying the book ISBN is moved to the front', async () => {
  db.addBook({ query: 'atomic habits', label: 'AH', isbn: '9780735211308', format: 'both' });
  const r = await scanner.scanBook(db.getBook(3));
  const ohio = r.libraries.find(l => l.library.name === 'Ohio');
  assert.equal(ohio.results[0].format, 'ebook');
  assert.deepEqual(ohio.results[0].isbns, ['9780735211308']);
});

test('scanAllActiveBooks scans only active books', async () => {
  const { scanned } = await scanner.scanAllActiveBooks();
  assert.equal(scanned, 2); // books 1 and 3; book 2 is archived
});
