# lib_getter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal, password-protected web app that scans Ohio library ebook catalogs for a saved wishlist and returns availability links.

**Architecture:** Node.js/Express serves server-rendered HTML (EJS templates, Tailwind CDN). SQLite stores the book wishlist and library registry. A pluggable adapter system isolates per-library search logic; adapters run in parallel per scan. Authentication is a single master password stored in an env var, protected by a signed session cookie.

**Tech Stack:** Node.js, Express, better-sqlite3, ejs, cookie-session, node-fetch@2, cheerio, Tailwind CSS (CDN), Railway

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/server.js` | Entry point — binds Express app to PORT |
| `src/app.js` | Express setup: view engine, middleware, route mounting |
| `src/db.js` | SQLite init, schema migration, all query helpers |
| `src/auth.js` | `requireAuth` middleware + `sessionMiddleware` config |
| `src/amazon.js` | Parse Amazon URLs to a display label |
| `src/scanner.js` | Run all enabled adapters in parallel for one book |
| `src/adapters/index.js` | Adapter registry map + `getAdapter(type)` |
| `src/adapters/overdrive.js` | OverDrive/Libby catalog search adapter |
| `src/adapters/scraper.js` | Generic CSS-selector scraper adapter |
| `src/routes/auth.js` | GET /login, POST /login, POST /logout |
| `src/routes/index.js` | GET / (dashboard) |
| `src/routes/books.js` | POST /books, POST /books/:id/scan, POST /books/scan-all, POST /books/:id/delete |
| `src/routes/libraries.js` | GET/POST /libraries, POST /libraries/:id/toggle, POST /libraries/:id/delete |
| `src/views/_nav.ejs` | Shared nav bar partial |
| `src/views/login.ejs` | Login page |
| `src/views/dashboard.ejs` | Book wishlist with inline scan results |
| `src/views/libraries.ejs` | Library manager |
| `package.json` | Dependencies and npm scripts |
| `.env.example` | Required env vars template |
| `.gitignore` | Excludes node_modules, .env, *.sqlite |
| `railway.json` | Railway deployment config |

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `railway.json`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/micahcooper/lib_getter
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install express better-sqlite3 ejs cookie-session node-fetch@2 cheerio dotenv
```

Note: `node-fetch@2` (not v3) — v2 uses CommonJS `require()`, which avoids needing ESM (`"type": "module"`) in the project.

- [ ] **Step 3: Update package.json scripts**

Edit `package.json`. Replace the `"scripts"` block with:

```json
"scripts": {
  "start": "node src/server.js",
  "dev": "node --watch src/server.js"
}
```

Also set `"main": "src/server.js"`.

- [ ] **Step 4: Create .env.example**

```
MASTER_PASSWORD=changeme
SESSION_SECRET=change-this-to-a-long-random-string
PORT=3000
DB_PATH=/data/db.sqlite
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
.env
*.sqlite
```

- [ ] **Step 6: Create railway.json**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node src/server.js",
    "healthcheckPath": "/login",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 7: Create source directory structure**

```bash
mkdir -p src/adapters src/routes src/views
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore railway.json
git commit -m "chore: bootstrap project with dependencies"
```

---

## Task 2: Database Layer

**Files:**
- Create: `src/db.js`

- [ ] **Step 1: Create src/db.js**

```js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'dev.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS libraries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    adapter_type TEXT    NOT NULL,
    config       TEXT    NOT NULL DEFAULT '{}',
    enabled      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS books (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    query           TEXT NOT NULL,
    label           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    last_scanned_at TEXT
  );
`);

// ── Libraries ────────────────────────────────────────────────────────────────

function getLibraries() {
  return db.prepare('SELECT * FROM libraries ORDER BY name').all();
}

function getEnabledLibraries() {
  return db.prepare('SELECT * FROM libraries WHERE enabled = 1').all();
}

function addLibrary({ name, adapter_type, config }) {
  return db
    .prepare('INSERT INTO libraries (name, adapter_type, config) VALUES (?, ?, ?)')
    .run(name, adapter_type, JSON.stringify(config));
}

function toggleLibrary(id, enabled) {
  return db
    .prepare('UPDATE libraries SET enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, id);
}

function deleteLibrary(id) {
  return db.prepare('DELETE FROM libraries WHERE id = ?').run(id);
}

// ── Books ─────────────────────────────────────────────────────────────────────

function getBooks() {
  return db.prepare('SELECT * FROM books ORDER BY created_at DESC').all();
}

function getBook(id) {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(id);
}

function addBook({ query, label }) {
  return db
    .prepare('INSERT INTO books (query, label, created_at) VALUES (?, ?, ?)')
    .run(query, label, new Date().toISOString());
}

function touchBook(id) {
  return db
    .prepare('UPDATE books SET last_scanned_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

function deleteBook(id) {
  return db.prepare('DELETE FROM books WHERE id = ?').run(id);
}

module.exports = {
  getLibraries, getEnabledLibraries, addLibrary, toggleLibrary, deleteLibrary,
  getBooks, getBook, addBook, touchBook, deleteBook,
};
```

- [ ] **Step 2: Smoke-test**

```bash
node -e "
require('dotenv').config();
const db = require('./src/db');
db.addBook({ query: 'test book', label: 'Test Book' });
console.log(db.getBooks());
"
```

Expected: array containing one book object printed to console.

- [ ] **Step 3: Commit**

```bash
git add src/db.js
git commit -m "feat: SQLite database layer with migrations and query helpers"
```

---

## Task 3: Auth Middleware + Login Routes

**Files:**
- Create: `src/auth.js`
- Create: `src/routes/auth.js`

- [ ] **Step 1: Create src/auth.js**

```js
const cookieSession = require('cookie-session');

const sessionMiddleware = cookieSession({
  name: 'session',
  secret: process.env.SESSION_SECRET || 'dev-secret',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

module.exports = { sessionMiddleware, requireAuth };
```

- [ ] **Step 2: Create src/routes/auth.js**

```js
const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  if (req.body.password === process.env.MASTER_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect('/');
  }
  res.render('login', { error: 'Invalid password' });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
```

- [ ] **Step 3: Commit**

```bash
git add src/auth.js src/routes/auth.js
git commit -m "feat: session auth middleware and login/logout routes"
```

---

## Task 4: Amazon URL Parser

**Files:**
- Create: `src/amazon.js`

- [ ] **Step 1: Create src/amazon.js**

```js
/**
 * Given a raw input string, return a human-friendly label.
 * If it looks like an Amazon URL with a title slug, extract it.
 * Otherwise, return the input as-is.
 *
 * Amazon URL patterns:
 *   https://www.amazon.com/Atomic-Habits-James-Clear/dp/0735211299  → "Atomic Habits James Clear"
 *   https://www.amazon.com/dp/0735211299                            → raw input (no slug)
 */
function parseLabel(input) {
  input = input.trim();
  try {
    const url = new URL(input);
    if (url.hostname.includes('amazon.')) {
      // Match slug before /dp/ — reject if the segment before /dp/ is itself "dp"
      const match = url.pathname.match(/^\/(.+?)\/dp\//);
      if (match && match[1] !== 'dp') {
        return match[1].replace(/-/g, ' ');
      }
    }
  } catch (_) {
    // not a URL — fall through
  }
  return input;
}

module.exports = { parseLabel };
```

- [ ] **Step 2: Smoke-test**

```bash
node -e "
const { parseLabel } = require('./src/amazon');
console.log(parseLabel('https://www.amazon.com/Atomic-Habits-James-Clear/dp/0735211299'));
// → 'Atomic Habits James Clear'
console.log(parseLabel('Atomic Habits'));
// → 'Atomic Habits'
console.log(parseLabel('https://www.amazon.com/dp/0735211299'));
// → 'https://www.amazon.com/dp/0735211299'  (no slug, falls back to raw)
"
```

- [ ] **Step 3: Commit**

```bash
git add src/amazon.js
git commit -m "feat: Amazon URL to display label parser"
```

---

## Task 5: Adapter Registry + OverDrive Adapter

**Files:**
- Create: `src/adapters/index.js`
- Create: `src/adapters/overdrive.js`

- [ ] **Step 1: Create src/adapters/index.js**

```js
const overdrive = require('./overdrive');
const scraper   = require('./scraper');

const ADAPTERS = { overdrive, scraper };

function getAdapter(type) {
  const adapter = ADAPTERS[type];
  if (!adapter) throw new Error(`Unknown adapter type: "${type}"`);
  return adapter;
}

module.exports = { getAdapter };
```

- [ ] **Step 2: Create src/adapters/overdrive.js**

The OverDrive thunder API is the internal API used by the Libby app. Each library has a `libraryKey` (the subdomain of their OverDrive page, e.g. `greenecounty` from `greenecounty.overdrive.com`).

```js
const fetch = require('node-fetch');

/**
 * Search OverDrive/Libby catalog for ebooks.
 * config: { libraryKey: "greenecounty" }
 * Returns: array of result objects (may be empty).
 */
async function search(query, config) {
  const { libraryKey } = config;
  if (!libraryKey) {
    return [{ title: null, author: null, available: false, checkoutUrl: null,
              error: 'Missing libraryKey in OverDrive config' }];
  }

  const url =
    `https://thunder.api.overdrive.com/v2/libraries/${libraryKey}/search` +
    `?q=${encodeURIComponent(query)}&format=ebook-overdrive&perPage=5&page=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; lib_getter/1.0)',
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!res.ok) {
      return [{ title: null, author: null, available: false, checkoutUrl: null,
                error: `OverDrive API returned HTTP ${res.status}` }];
    }

    const data = await res.json();
    const items = (data.items || []);
    if (items.length === 0) return [];

    return items.map(item => {
      const available = !!(item.availability && item.availability.isAvailable);
      return {
        title:       item.title || null,
        author:      item.creators ? item.creators.map(c => c.name).join(', ') : null,
        available,
        checkoutUrl: available
          ? `https://libbyapp.com/library/${libraryKey}/everything/page-1/book/${item.id}`
          : null,
        error: null,
      };
    });

  } catch (err) {
    return [{ title: null, author: null, available: false, checkoutUrl: null, error: err.message }];
  }
}

module.exports = { search };
```

**Important — verify the API endpoint before trusting results:**

```bash
curl -s "https://thunder.api.overdrive.com/v2/libraries/greenecounty/search?q=atomic+habits&format=ebook-overdrive&perPage=5&page=1" | head -c 500
```

If this returns a 404 or unexpected shape, open the Libby app (libbyapp.com) in a browser, search for a book, and inspect the Network tab in DevTools to find the correct endpoint and response shape. Update `overdrive.js` accordingly. The library key for Greene County Public Library may be `greenecounty`, `greenecountypl`, or similar — check their OverDrive URL to confirm.

- [ ] **Step 3: Commit**

```bash
git add src/adapters/index.js src/adapters/overdrive.js
git commit -m "feat: adapter registry and OverDrive/Libby search adapter"
```

---

## Task 6: Scraper Adapter

**Files:**
- Create: `src/adapters/scraper.js`

- [ ] **Step 1: Create src/adapters/scraper.js**

```js
const fetch   = require('node-fetch');
const cheerio = require('cheerio');

/**
 * Generic CSS-selector scraper adapter.
 * config: {
 *   searchUrl:            "https://example.com/search?q={query}",
 *   titleSelector:        ".book-title",
 *   availabilitySelector: ".availability",   // optional
 *   checkoutLinkSelector: "a.checkout-btn"   // optional
 * }
 * Returns: array of result objects.
 */
async function search(query, config) {
  const { searchUrl, titleSelector, availabilitySelector, checkoutLinkSelector } = config;

  if (!searchUrl || !titleSelector) {
    return [{ title: null, author: null, available: false, checkoutUrl: null,
              error: 'Scraper config requires searchUrl and titleSelector' }];
  }

  const url = searchUrl.replace('{query}', encodeURIComponent(query));

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; lib_getter/1.0)' },
      timeout: 10000,
    });

    if (!res.ok) {
      return [{ title: null, author: null, available: false, checkoutUrl: null,
                error: `Scraper got HTTP ${res.status} from ${url}` }];
    }

    const html = await res.text();
    const $    = cheerio.load(html);

    const results = [];

    $(titleSelector).each((_, el) => {
      const title = $(el).text().trim() || null;

      const row = $(el).closest('[class]'); // walk up to a containing row

      const availText = availabilitySelector
        ? row.find(availabilitySelector).first().text().trim().toLowerCase()
        : '';
      const available = availText.includes('available') || availText.includes('borrow');

      let checkoutUrl = null;
      if (checkoutLinkSelector) {
        const href = row.find(checkoutLinkSelector).first().attr('href');
        if (href) {
          checkoutUrl = href.startsWith('http') ? href : new URL(url).origin + href;
        }
      }

      results.push({ title, author: null, available, checkoutUrl, error: null });
    });

    return results;

  } catch (err) {
    return [{ title: null, author: null, available: false, checkoutUrl: null, error: err.message }];
  }
}

module.exports = { search };
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/scraper.js
git commit -m "feat: generic CSS scraper adapter"
```

---

## Task 7: Scanner Orchestrator

**Files:**
- Create: `src/scanner.js`

- [ ] **Step 1: Create src/scanner.js**

```js
const { getEnabledLibraries, touchBook } = require('./db');
const { getAdapter } = require('./adapters/index');

/**
 * Run all enabled library adapters against a book query in parallel.
 * Updates last_scanned_at on the book record when at least one adapter responds.
 *
 * Returns: Array of { library: { id, name, ... }, results: [...] }
 */
async function scanBook(bookId, query) {
  const libraries = getEnabledLibraries();

  const scanPromises = libraries.map(async (lib) => {
    let adapter;
    try {
      adapter = getAdapter(lib.adapter_type);
    } catch (err) {
      return {
        library: lib,
        results: [{ title: null, author: null, available: false, checkoutUrl: null, error: err.message }],
      };
    }

    const config  = JSON.parse(lib.config || '{}');
    const results = await adapter.search(query, config);
    return { library: lib, results };
  });

  const scanResults = await Promise.all(scanPromises);

  if (scanResults.length > 0) touchBook(bookId);

  return scanResults;
}

module.exports = { scanBook };
```

- [ ] **Step 2: Commit**

```bash
git add src/scanner.js
git commit -m "feat: scanner orchestrates parallel adapter calls per book"
```

---

## Task 8: HTML Views

**Files:**
- Create: `src/views/_nav.ejs`
- Create: `src/views/login.ejs`
- Create: `src/views/dashboard.ejs`
- Create: `src/views/libraries.ejs`

- [ ] **Step 1: Create src/views/_nav.ejs**

```html
<nav class="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
  <a href="/" class="text-lg font-semibold text-gray-800">lib_getter</a>
  <div class="flex gap-4 items-center">
    <a href="/libraries" class="text-sm text-gray-600 hover:text-gray-900">Libraries</a>
    <form action="/logout" method="POST" class="inline">
      <button type="submit" class="text-sm text-gray-500 hover:text-red-600">Logout</button>
    </form>
  </div>
</nav>
```

- [ ] **Step 2: Create src/views/login.ejs**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>lib_getter — Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
  <div class="bg-white rounded-lg shadow p-8 w-full max-w-sm">
    <h1 class="text-xl font-semibold text-gray-800 mb-6">lib_getter</h1>
    <% if (error) { %>
      <p class="text-red-600 text-sm mb-4"><%= error %></p>
    <% } %>
    <form action="/login" method="POST">
      <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
      <input type="password" name="password" autofocus
        class="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500">
      <button type="submit"
        class="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700">
        Sign in
      </button>
    </form>
  </div>
</body>
</html>
```

- [ ] **Step 3: Create src/views/dashboard.ejs**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>lib_getter</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <%- include('_nav') %>
  <main class="max-w-4xl mx-auto px-6 py-8">

    <!-- Header + Scan All -->
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-semibold text-gray-800">My Wishlist</h2>
      <form action="/books/scan-all" method="POST">
        <button type="submit"
          class="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">
          Scan All
        </button>
      </form>
    </div>

    <!-- Add Book -->
    <form action="/books" method="POST" class="mb-8 flex gap-2">
      <input type="text" name="query" placeholder="Title, keywords, or Amazon URL"
        class="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        required>
      <button type="submit"
        class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
        Add Book
      </button>
    </form>

    <!-- Book Cards -->
    <% if (books.length === 0) { %>
      <p class="text-gray-500 text-sm">No books yet. Add one above.</p>
    <% } %>

    <% books.forEach(book => { %>
      <div class="bg-white rounded-lg shadow mb-4 p-4" id="book-<%= book.id %>">
        <div class="flex justify-between items-start">
          <div>
            <p class="font-medium text-gray-800"><%= book.label %></p>
            <% if (book.last_scanned_at) { %>
              <p class="text-xs text-gray-400 mt-0.5">
                Last scanned: <%= new Date(book.last_scanned_at).toLocaleString() %>
              </p>
            <% } %>
          </div>
          <div class="flex gap-2 items-center shrink-0 ml-4">
            <button onclick="scanBook(<%= book.id %>, this)"
              class="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">
              Scan
            </button>
            <form action="/books/<%= book.id %>/delete" method="POST" class="inline">
              <button type="submit" class="text-sm text-red-400 hover:text-red-600">✕</button>
            </form>
          </div>
        </div>
        <div id="results-<%= book.id %>" class="mt-3"></div>
      </div>
    <% }) %>

  </main>

  <script>
    async function scanBook(id, btn) {
      btn.disabled = true;
      btn.textContent = 'Scanning…';
      try {
        const res  = await fetch('/books/' + id + '/scan', { method: 'POST' });
        const html = await res.text();
        document.getElementById('results-' + id).innerHTML = html;
      } catch (e) {
        document.getElementById('results-' + id).innerHTML =
          '<p class="text-red-500 text-sm">Request failed</p>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Scan';
      }
    }
  </script>
</body>
</html>
```

- [ ] **Step 4: Create src/views/libraries.ejs**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>lib_getter — Libraries</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <%- include('_nav') %>
  <main class="max-w-4xl mx-auto px-6 py-8">

    <h2 class="text-xl font-semibold text-gray-800 mb-6">Libraries</h2>

    <!-- Add Library Form -->
    <div class="bg-white rounded-lg shadow p-6 mb-8">
      <h3 class="font-medium text-gray-800 mb-4">Add Library</h3>
      <form action="/libraries" method="POST" class="space-y-4">

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" name="name" placeholder="Greene County Public Library"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm" required>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Adapter Type</label>
          <select name="adapter_type" onchange="showFields(this.value)"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="overdrive">OverDrive / Libby</option>
            <option value="scraper">Custom Scraper</option>
          </select>
        </div>

        <!-- OverDrive fields (shown by default) -->
        <div id="fields-overdrive">
          <label class="block text-sm font-medium text-gray-700 mb-1">Library Key</label>
          <input type="text" name="libraryKey" placeholder="greenecounty"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
          <p class="text-xs text-gray-500 mt-1">
            The subdomain of your library's OverDrive page —
            e.g. <code>greenecounty</code> from <code>greenecounty.overdrive.com</code>
          </p>
        </div>

        <!-- Scraper fields (hidden by default) -->
        <div id="fields-scraper" class="space-y-3 hidden">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Search URL</label>
            <input type="text" name="searchUrl" placeholder="https://example.com/search?q={query}"
              class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
            <p class="text-xs text-gray-500 mt-1">Use <code>{query}</code> as the placeholder for the search term.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title Selector</label>
            <input type="text" name="titleSelector" placeholder=".book-title"
              class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Availability Selector (optional)</label>
            <input type="text" name="availabilitySelector" placeholder=".availability-status"
              class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Checkout Link Selector (optional)</label>
            <input type="text" name="checkoutLinkSelector" placeholder="a.checkout-btn"
              class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
          </div>
        </div>

        <button type="submit"
          class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
          Add Library
        </button>
      </form>
    </div>

    <!-- Library List -->
    <% if (libraries.length === 0) { %>
      <p class="text-gray-500 text-sm">No libraries yet.</p>
    <% } %>

    <% libraries.forEach(lib => { %>
      <div class="bg-white rounded-lg shadow px-4 py-3 mb-3 flex justify-between items-center">
        <div>
          <p class="font-medium text-gray-800"><%= lib.name %></p>
          <p class="text-xs text-gray-500"><%= lib.adapter_type %></p>
        </div>
        <div class="flex gap-3 items-center">
          <form action="/libraries/<%= lib.id %>/toggle" method="POST" class="inline">
            <button type="submit"
              class="text-sm px-3 py-1 rounded <%= lib.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500' %>">
              <%= lib.enabled ? 'Enabled' : 'Disabled' %>
            </button>
          </form>
          <form action="/libraries/<%= lib.id %>/delete" method="POST" class="inline">
            <button type="submit" class="text-sm text-red-400 hover:text-red-600">✕</button>
          </form>
        </div>
      </div>
    <% }) %>

  </main>

  <script>
    function showFields(type) {
      document.getElementById('fields-overdrive').classList.toggle('hidden', type !== 'overdrive');
      document.getElementById('fields-scraper').classList.toggle('hidden', type !== 'scraper');
    }
  </script>
</body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add src/views/
git commit -m "feat: EJS views — login, dashboard, library manager, shared nav partial"
```

---

## Task 9: Route Handlers

**Files:**
- Create: `src/routes/index.js`
- Create: `src/routes/books.js`
- Create: `src/routes/libraries.js`

- [ ] **Step 1: Create src/routes/index.js**

```js
const express = require('express');
const router  = express.Router();
const { getBooks } = require('../db');

router.get('/', (req, res) => {
  res.render('dashboard', { books: getBooks() });
});

module.exports = router;
```

- [ ] **Step 2: Create src/routes/books.js**

```js
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

// Scan all books (full page refresh — results visible via individual Scan buttons after)
router.post('/scan-all', async (req, res) => {
  const books = getBooks();
  await Promise.all(books.map(b => scanBook(b.id, b.query)));
  res.redirect('/');
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
```

- [ ] **Step 3: Create src/routes/libraries.js**

```js
const express  = require('express');
const router   = express.Router();
const { getLibraries, addLibrary, toggleLibrary, deleteLibrary } = require('../db');

router.get('/', (req, res) => {
  res.render('libraries', { libraries: getLibraries() });
});

router.post('/', (req, res) => {
  const { name, adapter_type, libraryKey, searchUrl,
          titleSelector, availabilitySelector, checkoutLinkSelector } = req.body;

  const config = adapter_type === 'overdrive'
    ? { libraryKey }
    : { searchUrl, titleSelector, availabilitySelector, checkoutLinkSelector };

  addLibrary({ name, adapter_type, config });
  res.redirect('/libraries');
});

router.post('/:id/toggle', (req, res) => {
  const lib = getLibraries().find(l => l.id == req.params.id);
  if (lib) toggleLibrary(lib.id, !lib.enabled);
  res.redirect('/libraries');
});

router.post('/:id/delete', (req, res) => {
  deleteLibrary(req.params.id);
  res.redirect('/libraries');
});

module.exports = router;
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/
git commit -m "feat: route handlers for dashboard, books, and library manager"
```

---

## Task 10: App Entry Point + Wire-Up

**Files:**
- Create: `src/app.js`
- Create: `src/server.js`

- [ ] **Step 1: Create src/app.js**

```js
const express = require('express');
const path    = require('path');
const { sessionMiddleware, requireAuth } = require('./auth');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);

// Public routes
app.use(require('./routes/auth'));

// Protected routes
app.use('/',          requireAuth, require('./routes/index'));
app.use('/books',     requireAuth, require('./routes/books'));
app.use('/libraries', requireAuth, require('./routes/libraries'));

module.exports = app;
```

- [ ] **Step 2: Create src/server.js**

```js
require('dotenv').config();
const app  = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`lib_getter running on http://localhost:${PORT}`));
```

- [ ] **Step 3: Create a local .env for development**

```bash
cp .env.example .env
```

Edit `.env` — set `MASTER_PASSWORD` and `SESSION_SECRET` to any values. Leave `DB_PATH` unset for local dev (will write `dev.sqlite` in the project root).

- [ ] **Step 4: Start the app**

```bash
npm start
```

- [ ] **Step 5: Verify the full flow**

1. Open http://localhost:3000 — should redirect to `/login`
2. Enter the password from `.env` — should reach the dashboard
3. Add a book: type "Atomic Habits" and click Add Book — card should appear
4. Go to `/libraries`, add an OverDrive library with `libraryKey=greenecounty` (verify the key at `greenecounty.overdrive.com`)
5. Return to dashboard, click Scan on the book — results should appear inline
6. Test the logout button — should return to `/login`

If the OverDrive scan returns an error, run the curl verification command from Task 5 and inspect the response to adjust the API endpoint in `src/adapters/overdrive.js`.

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/server.js
git commit -m "feat: wire up Express app and entry point — app is functional end-to-end"
```

---

## Task 11: Railway Deployment

- [ ] **Step 1: Push to GitHub**

Create a GitHub repo and push:

```bash
git remote add origin https://github.com/<your-username>/lib_getter.git
git push -u origin main
```

- [ ] **Step 2: Create a Railway project**

Go to [railway.app](https://railway.app), create a new project, and connect the GitHub repo. Railway will detect the `railway.json` and auto-configure.

- [ ] **Step 3: Add a volume for SQLite persistence**

In the Railway dashboard: Project → Add Service → Volume. Mount it at `/data`. Without this, the SQLite file is lost on every redeploy.

- [ ] **Step 4: Set environment variables**

In Railway → Variables, add:

```
MASTER_PASSWORD=<your-password>
SESSION_SECRET=<long-random-string>
DB_PATH=/data/db.sqlite
NODE_ENV=production
```

- [ ] **Step 5: Deploy and verify**

Railway will auto-deploy from the main branch. Visit the generated `.railway.app` URL, log in, and confirm the app works end-to-end in production.
