# lib_getter Design Spec
**Date:** 2026-03-21

## Overview

A personal, password-protected web application that scans Ohio public library ebook catalogs to find ebooks from a saved wishlist. Built with Node.js/Express, server-rendered HTML with Tailwind CSS, and SQLite. Deploys on Railway. Starts with OverDrive/Libby support; extensible to other library platforms via a pluggable adapter architecture.

---

## Architecture

A Node.js/Express server renders all pages server-side. SQLite (via `better-sqlite3`) is the only data store. A pluggable adapter system decouples library-specific search logic from core app logic.

### Core Modules

- **`src/adapters/`** — one file per library type. Each exports a `search(query, config)` function.
- **`src/db.js`** — SQLite setup, migrations, and query helpers.
- **`src/auth.js`** — session middleware that checks a signed cookie against `process.env.MASTER_PASSWORD`.
- **`src/routes/`** — Express route handlers: `index.js` (dashboard), `books.js`, `libraries.js`, `auth.js`.
- **`src/views/`** — HTML templates (using a lightweight templating engine such as `eta` or raw template literals).

---

## Data Models

### `libraries` table

| Column         | Type        | Notes                                                                 |
|----------------|-------------|-----------------------------------------------------------------------|
| id             | INTEGER PK  | Auto-increment                                                        |
| name           | TEXT        | Display name, e.g. "Greene County Public Library"                     |
| adapter_type   | TEXT        | `"overdrive"` or `"scraper"`                                          |
| config         | TEXT        | JSON blob — adapter-specific config (library key, URLs, selectors)    |
| enabled        | INTEGER     | 0/1 toggle                                                            |

### `books` table

| Column          | Type        | Notes                                                      |
|-----------------|-------------|------------------------------------------------------------|
| id              | INTEGER PK  | Auto-increment                                             |
| query           | TEXT        | Raw input: title, keywords, or Amazon URL                  |
| label           | TEXT        | Human-friendly display title                               |
| created_at      | TEXT        | ISO 8601 timestamp                                         |
| last_scanned_at | TEXT        | ISO 8601 timestamp; null until first scan                  |

Scan results are **not persisted** — fetched live on demand. The wishlist is a list of search targets, not a results cache. `last_scanned_at` is updated on the `books` row at the end of each per-book scan (success or partial failure — as long as at least one adapter responded).

---

## Adapter Contract

Every adapter exports a single async function:

```js
// src/adapters/<name>.js
async function search(query, config) {
  return {
    title: String,       // matched title (may be null)
    author: String,      // matched author (may be null)
    available: Boolean,  // true if currently available to borrow
    checkoutUrl: String, // direct link to checkout page (may be null)
    error: String        // error message if adapter failed (may be null)
  };
}
```

- Adapters **never throw** — all errors are returned in the `error` field.
- A failing adapter does not block results from other adapters.
- Adding a new adapter = add a file to `src/adapters/` and register it in the adapter map.
- Adapters return an **array** of results (not a single object) to handle multiple editions/formats. Each element follows the shape above. An empty array means no match found.

### Built-in Adapters

**`overdrive.js`** — Calls Libby's internal search API. Config shape:
```json
{ "libraryKey": "greene-county-oh" }
```

**`scraper.js`** — Fetches a URL with `node-fetch` and parses HTML with `cheerio`. Config shape:
```json
{
  "searchUrl": "https://example.com/search?q={query}",
  "titleSelector": ".book-title",
  "availabilitySelector": ".availability",
  "checkoutLinkSelector": ".checkout-link"
}
```

---

## UI Layout

All pages are server-rendered. Tailwind CSS via CDN.

### `/login`
Simple centered form with a password field. On success, sets a signed session cookie and redirects to `/`. All other routes redirect here if unauthenticated.

### `/` — Dashboard
- Wishlist of books displayed as cards.
- Each card: query label, "Scan" button, and (after scanning) per-library result rows showing library name, availability badge (available / unavailable / error), and checkout link if available.
- "Scan All" button at the top runs every book against every enabled library.
- "Add Book" inline form or modal: single text field accepting title, keywords, or Amazon URL.
  - Amazon URLs are parsed server-side by extracting the title slug from the URL path (e.g. `/dp/B0...` preceded by the slug). No outbound HTTP request is made to Amazon. If parsing fails or the input is not an Amazon URL, the raw input is used as the label. This is best-effort.

### `/libraries` — Library Manager
- List of all registered libraries with name, adapter type, enabled toggle, edit/delete actions.
- "Add Library" form with:
  - Name field
  - Adapter type dropdown (OverDrive / Scraper)
  - Dynamic config fields based on selected type:
    - OverDrive: library key field
    - Scraper: search URL, title selector, availability selector, checkout link selector

---

## Authentication

- Single master password stored in `process.env.MASTER_PASSWORD`.
- Session managed via a signed cookie (`express-session` or `cookie-session`).
- No user accounts; single-user app.
- Session secret stored in `process.env.SESSION_SECRET`.

---

## Deployment

- Platform: Railway
- Environment variables: `MASTER_PASSWORD`, `SESSION_SECRET`, `PORT`
- SQLite database file persisted via a Railway volume (mounted at `/data/db.sqlite` or similar)
- No build step required beyond `npm install`; Tailwind loaded via CDN

---

## Dependencies

| Package           | Purpose                              |
|-------------------|--------------------------------------|
| `express`         | HTTP server and routing              |
| `better-sqlite3`  | SQLite ORM-free database access      |
| `node-fetch`      | HTTP requests in adapters            |
| `cheerio`         | HTML parsing for scraper adapter     |
| `cookie-session`  | Signed session cookie                |
| `eta`             | Lightweight HTML templating          |

---

## Out of Scope (v1)

- Automated background re-scanning / notifications
- Actual checkout automation (logging into library accounts)
- Import from Goodreads or other sources
- User accounts or multi-user support
- Automated test suite
