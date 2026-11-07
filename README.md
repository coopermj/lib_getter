# lib_getter

A personal web app for tracking ebook and audiobook availability across public libraries. Add books to a wishlist, scan your configured libraries on demand or on a schedule, get notified the moment a title becomes available, and jump straight to the Borrow (or Place hold) page in Libby.

## Features

- Single-password login (one user; rate limited)
- Add books by title, ISBN, Amazon link or Goodreads link — ISBNs are resolved to a title and author via Open Library
- Ebook, audiobook, or either — per book
- OverDrive / Libby adapter for any OverDrive library, plus a generic CSS-selector scraper for other catalogs
- Scan one book or all books; results are stored and shown on the dashboard, with the best match per library first and the rest folded away
- Hold-queue details: copies owned, holds in line, estimated wait, and a **Place hold** link when a title is unavailable
- Scheduled background scans with push notifications (ntfy or any webhook) when a book becomes available
- Mark books as borrowed or archived to keep the wishlist focused
- Edit books (title, search term, ISBN, format) and libraries after creating them

## Setup

### Prerequisites

- Node.js 20+
- A Railway account (for deployment) or just run locally

### Local development

```bash
npm install
MASTER_PASSWORD=yourpassword npm run dev
```

Open http://localhost:3000.

The SQLite database is created at `dev.sqlite` in the project root. Run the tests with:

```bash
npm test
```

### Deploy to Railway

1. Push the repo to GitHub.
2. Create a new Railway project and connect the GitHub repo.
3. Add a **Volume** mounted at `/data` for persistent storage.
4. Set environment variables:
   - `MASTER_PASSWORD` — your login password
   - `SESSION_SECRET` — a long random string used to sign login cookies (required in production; e.g. `openssl rand -hex 32`)
   - `DB_PATH` — `/data/lib_getter.db`
   - `SCAN_INTERVAL_MINUTES` and `NTFY_TOPIC` — if you want background scans and notifications (see below)
5. Railway will build and deploy automatically via `nixpacks.toml`.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MASTER_PASSWORD` | Yes | Login password |
| `SESSION_SECRET` | In production | Secret for signing login cookies; the app refuses to start without it when `NODE_ENV=production` |
| `DB_PATH` | No | SQLite file path (default: `dev.sqlite`) |
| `PORT` | No | Server port (default: `3000`) |
| `SCAN_INTERVAL_MINUTES` | No | Scan every active book this often in the background (default: off) |
| `NTFY_TOPIC` | No | [ntfy](https://ntfy.sh) topic to push "now available" notifications to |
| `NTFY_URL` | No | Self-hosted ntfy server (default: `https://ntfy.sh`) |
| `NTFY_TOKEN` | No | Access token for a protected ntfy topic |
| `NOTIFY_WEBHOOK_URL` | No | Any URL to POST `{ title, body, url }` JSON to when a book becomes available |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MINUTES` | No | Login rate limit (default: 10 attempts per 15 minutes per IP) |

### Notifications

The easiest setup is [ntfy](https://ntfy.sh): install the app on your phone, subscribe to a topic name of your choosing (pick something unguessable — topics are public by default), then set `NTFY_TOPIC` to that name and `SCAN_INTERVAL_MINUTES` to, say, `180`. When a scan finds a book has gone from unavailable to available you get a push notification; tapping it opens the Libby borrow page. ntfy can also forward to email if you prefer.

A notification is sent once per flip — not on every scan while the title stays available — and only for books on the active wishlist.

---

## Adding libraries

See [docs/libraries.md](docs/libraries.md) for a list of configured libraries and full instructions on how to find the library key for any OverDrive/Libby library.

Short version: the library key is the subdomain from `https://<key>.overdrive.com`, or the segment after `/library/` in any Libby URL. For example, the Ohio Digital Library is `ohdbks`.

---

## Stack

- **Node.js / Express** — server
- **EJS** — server-rendered templates
- **better-sqlite3** — SQLite (WAL mode)
- **node-fetch + cheerio** — OverDrive API, Open Library, scraper adapter
- **node:test** — test suite with recorded API fixtures (no network needed)
- **Railway** — hosting and volume storage
