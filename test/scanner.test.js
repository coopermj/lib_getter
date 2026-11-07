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
  assert.equal(n.url, '/', 'published as JSON to the server root');
  const payload = JSON.parse(n.body);
  assert.equal(payload.topic, 'lib-test');
  assert.match(payload.title, /Available: Atomic Habits/);
  assert.match(payload.click, /libbyapp\.com/);
  assert.match(payload.message, /audiobook/);

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

test('notifies titles with non-Latin-1 characters', async () => {
  available = false;
  db.addBook({ query: 'atomic habits', label: 'Café — “A Memoir”', format: 'ebook' });
  const id = db.getBooks('active').find(b => b.label.startsWith('Caf')).id;
  await scanner.scanBook(db.getBook(id));
  available = true;
  const r = await scanner.scanBook(db.getBook(id));
  await settle();
  assert.deepEqual(r.newlyAvailable, ['Ohio']);
  const payload = JSON.parse(ntfy.requests.at(-1).body);
  assert.equal(payload.title, 'Available: Café — “A Memoir”');
  db.deleteBook(id);
});

test('concurrent scans of one book share a single run and notify once', async () => {
  available = false;
  db.addBook({ query: 'atomic habits', label: 'Race', format: 'ebook' });
  const id = db.getBooks('active').find(b => b.label === 'Race').id;
  await scanner.scanBook(db.getBook(id));
  available = true;
  const before = ntfy.requests.length;
  const [a, b] = await Promise.all([scanner.scanBook(db.getBook(id)), scanner.scanBook(db.getBook(id))]);
  await settle();
  assert.equal(a, b, 'same result object');
  assert.equal(ntfy.requests.length, before + 1);
  db.deleteBook(id);
});

test('a result carrying the book ISBN is moved to the front', async () => {
  const { lastInsertRowid } = db.addBook({ query: 'atomic habits', label: 'AH', isbn: '9780735211308', format: 'both' });
  const r = await scanner.scanBook(db.getBook(lastInsertRowid));
  const ohio = r.libraries.find(l => l.library.name === 'Ohio');
  assert.equal(ohio.results[0].format, 'ebook');
  assert.deepEqual(ohio.results[0].isbns, ['9780735211308']);
});

test('a library with no matches is remembered as "no match" and disabled libraries are hidden', async () => {
  db.addBook({ query: 'nothing', label: 'Nothing', format: 'ebook' });
  const id = db.getBooks('active').find(b => b.label === 'Nothing').id;
  await scanner.scanBook(db.getBook(id));
  const rows = db.getScanResults(id).filter(r => r.libraryName === 'Ohio');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].noMatch, true);

  db.toggleLibrary(1, false);
  assert.equal(db.getScanResults(id).some(r => r.libraryName === 'Ohio'), false);
  db.toggleLibrary(1, true);
  assert.equal(db.getScanResults(id).length, 0, 'disabling cleared the stored results');
  db.deleteBook(id);
});

test('editing a book search term or a library config clears stored results', async () => {
  await scanner.scanBook(db.getBook(1));
  assert.ok(db.getScanResults(1).length > 0);
  db.updateBook(1, { query: 'atomic habits', label: 'Renamed only', format: 'both' });
  assert.ok(db.getScanResults(1).length > 0, 'label-only edit keeps results');
  db.updateBook(1, { query: 'atomic habits clear', label: 'Renamed only', format: 'both' });
  assert.equal(db.getScanResults(1).length, 0);
  assert.equal(db.getBook(1).last_scanned_at, null);

  await scanner.scanBook(db.getBook(1));
  db.updateLibrary(1, { name: 'Ohio Renamed', adapter_type: 'overdrive', config: { libraryKey: 'ohdbks' } });
  assert.ok(db.getScanResults(1).length > 0, 'rename keeps results');
  db.updateLibrary(1, { name: 'Ohio', adapter_type: 'overdrive', config: { libraryKey: 'ohdbks', rowSelector: '' } });
  assert.ok(db.getScanResults(1).length > 0, 'a new empty form field is not a change');
  db.updateLibrary(1, { name: 'Ohio', adapter_type: 'overdrive', config: { libraryKey: 'other' } });
  assert.equal(db.getScanResults(1).length, 0);
});

test('scanAllActiveBooks scans only active books and counts what it scanned', async () => {
  const { scanned } = await scanner.scanAllActiveBooks();
  assert.equal(scanned, db.getBooks('active').length);
  assert.equal(scanned, 2); // books 1 and 3; book 2 is archived
});
