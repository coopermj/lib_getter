# lib_getter

A personal web app for tracking ebook availability across Ohio public libraries. Add books to a wishlist, scan your configured libraries on demand, and get a direct Borrow link when a title is available.

**Live:** https://helpful-charm-production-6f74.up.railway.app

---

## Features

- Add books by title, keywords, Amazon URL, or Goodreads URL
- Scan one book or all books at once across your library list
- Per-library availability with a direct Borrow link (opens in Libby)
- Manage libraries — add, enable/disable, or remove
- Single master password for access
- Deployed on Railway with persistent SQLite storage

---

## Setup

### Prerequisites

- Node.js 20+
- A Railway account (for deployment) or just run locally

### Local development

```bash
npm install
MASTER_PASSWORD=yourpassword npm run dev
```

Open http://localhost:8080.

The SQLite database is created at `dev.sqlite` in the project root.

### Deploy to Railway

1. Push the repo to GitHub.
2. Create a new Railway project and connect the GitHub repo.
3. Add a **Volume** mounted at `/data` for persistent storage.
4. Set environment variables:
   - `MASTER_PASSWORD` — your login password
   - `DB_PATH` — `/data/lib_getter.db`
5. Railway will build and deploy automatically via `nixpacks.toml`.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MASTER_PASSWORD` | Yes | Login password |
| `DB_PATH` | No | SQLite file path (default: `dev.sqlite`) |
| `PORT` | No | Server port (default: `8080`) |

---

## Adding libraries

See [docs/libraries.md](docs/libraries.md) for a list of configured libraries and full instructions on how to find the library key for any OverDrive/Libby library.

Short version: the library key is the subdomain from `https://<key>.overdrive.com`, or the segment after `/library/` in any Libby URL.

---

## Stack

- **Node.js / Express** — server
- **EJS** — server-rendered templates
- **better-sqlite3** — SQLite (WAL mode)
- **node-fetch + cheerio** — OverDrive API + scraper adapter
- **Railway** — hosting and volume storage
