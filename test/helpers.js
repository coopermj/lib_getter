const http = require('http');
const path = require('path');
const fs   = require('fs');

/** Start a throwaway HTTP server; handler(req, res, body). Returns { url, close, requests }. */
function startServer(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({ url, requests, close: () => new Promise(r => server.close(r)) });
    });
  });
}

/** A fake OverDrive thunder API serving the recorded search fixture for any library except "nope". */
function startFakeOverDrive(overrides = {}) {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'overdrive-search.json'), 'utf8'));
  return startServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.includes('/libraries/nope/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Library not found.', errorCode: 'LibraryNotFound' }));
    }
    if (u.searchParams.get('query') === 'nothing') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ items: [], totalItems: 0 }));
    }
    const data = typeof overrides.transform === 'function' ? overrides.transform(structuredClone(fixture), u) : fixture;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  });
}

/** Form-encoded POST that doesn't follow redirects. */
async function post(base, p, body, headers = {}) {
  return fetch(base + p, {
    method: 'POST',
    body: typeof body === 'string' ? body : new URLSearchParams(body).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    redirect: 'manual',
  });
}

module.exports = { startServer, startFakeOverDrive, post };
