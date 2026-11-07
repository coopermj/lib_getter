const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startFakeOverDrive } = require('./helpers');

let server, overdrive;
before(async () => {
  server = await startFakeOverDrive();
  process.env.OVERDRIVE_API_BASE = server.url + '/v2';
  overdrive = require('../src/adapters/overdrive'); // reads the env var at load time
});
after(() => server.close());

test('maps search items (format, availability, holds, ISBNs) without extra availability calls', async () => {
  const results = await overdrive.search('atomic habits', { libraryKey: 'ohdbks' }, { format: 'both' });
  assert.equal(server.requests.length, 1, 'one request per search');
  const u = new URL(server.requests[0].url, 'http://x');
  assert.equal(u.searchParams.get('format'), 'ebook-overdrive,audiobook-overdrive');
  assert.equal(u.searchParams.get('perPage'), '10', 'room for both formats');
  assert.equal(u.searchParams.get('query'), 'atomic habits');

  assert.equal(results.length, 3);
  const [audio, ebook] = results;
  assert.equal(audio.format, 'audiobook');
  assert.equal(audio.author, 'James Clear', 'narrator duplicate is collapsed');
  assert.equal(audio.available, true);
  assert.equal(ebook.format, 'ebook');
  assert.equal(ebook.available, false);
  assert.equal(ebook.holds, 49);
  assert.equal(ebook.copies, 35);
  assert.equal(ebook.waitDays, 350);
  assert.deepEqual(ebook.isbns, ['9780735211308']);
  assert.match(ebook.checkoutUrl, /^https:\/\/libbyapp\.com\/library\/ohdbks\/everything\/page-1\/\d+$/);
});

test('default format is ebook only', async () => {
  await overdrive.search('x', { libraryKey: 'ohdbks' });
  const u = new URL(server.requests.at(-1).url, 'http://x');
  assert.equal(u.searchParams.get('format'), 'ebook-overdrive');
  assert.equal(u.searchParams.get('perPage'), '5');
});

test('unknown library key → helpful error row; empty search → []', async () => {
  const [err] = await overdrive.search('x', { libraryKey: 'nope' });
  assert.match(err.error, /not found.*library key/);
  assert.deepEqual(await overdrive.search('nothing', { libraryKey: 'ohdbks' }), []);
  const [cfg] = await overdrive.search('x', {});
  assert.match(cfg.error, /libraryKey/);
});
