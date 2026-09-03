# SaveWiser

**Save smarter.** A Liquid-Glass-styled Electron desktop app that helps people in Singapore find money-saving deals, stay on top of government financial-assistance schemes, and keep their monthly spending under control — all in one place.

## The problem it addresses

Money-saving information in Singapore is scattered: deals are spread across blogs and store pages, government assistance schemes (CDC Vouchers, GST Voucher, ComCare, etc.) aren't always surfaced to the people eligible for them, and there's no easy, low-friction way for someone to see whether they're actually staying within the budget they set for themselves each month. SaveWiser pulls all three into a single, easy-to-scan desktop app so users don't have to hunt across multiple sites or spreadsheets to save money.

## Key features

1. **Lobang Radar** — a live-scraped deals feed across three categories (government-assistance deals, supermarket promos, and amenities/F&B such as gyms, pharmacies and restaurants), all run through one shared pipeline: *scrape → relevance filter → expiry filter → dedup → output*. Ships in offline **demo mode** by default (fixed fixture data, safe for a live presentation) with a code path ready for real, live scraping.
2. **Announcements** — a mock Singpass login (QR/OTP simulation) unlocks a subscribable feed of government financial-assistance schemes: curated defaults (Budget 2026, GST Voucher, Assurance Package, ComCare) plus live items pulled from the scraper's official sources, each with a per-scheme eligibility hint and a notification-subscribe toggle.
3. **Budget Tracker** — set a monthly spending cap per category (Groceries, Transport, Food, Household, Entertainment, Others, or your own custom category), log spending against it from one unified "Log Spending" flow, and watch a live over/under-budget progress bar. Stay under a category's cap for a full past month and you unlock a themed **collectible badge** — a gamified, non-monetary reward for good budgeting.

All state (Singpass session, subscriptions, budget categories, spending logs) is persisted locally to a JSON file in the OS app-data directory — no backend server or account required.

### Design

Styled after Apple's Liquid Glass: translucent, blurred panels, a floating pill header and bottom nav, and a single accent color (`#005EBA`) throughout. On macOS the window is truly transparent with native vibrancy (the desktop blurs through it); on Windows/Linux the same look is approximated with a CSS-only blur effect.

## Prerequisites

Install these before running the app:

| Requirement | Why | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) (LTS) + npm | Runs Electron and installs dependencies | `node -v` / `npm -v` to check |
| Python 3 | Runs the deals scraper (`scraper/savewiser_deal_scraper.py`) | Must be on your PATH as `python3` (macOS/Linux) or `python` (Windows) |

No Python packages are required to run the app as shipped — demo mode uses only the Python standard library. `requests` and `beautifulsoup4` are only needed if you switch the scraper to live (non-demo) mode (see **Configuration** below).

## Setup & running

1. **Get the project folder** (`savewiser 5` / the unzipped `savewiser.zip`) onto your machine and open a terminal in it.
2. **Install dependencies:**
   ```bash
   npm install
   ```
   This installs Electron (`^44.1.0`) as a dev dependency. The first run downloads the Electron binary, so it can take a minute depending on your connection.
3. **Run the app:**
   ```bash
   npm start
   ```
   This runs `electron .`, which launches `main.js` (the Electron main process) and opens the app window.

That's it — no build step, database, or API keys are required to run the demo.

### Alternative: instant preview, no install

`preview.html` is a single self-contained file with the scraper's demo output baked in as a fixture. Double-click it or open it in any browser for an instant look at the UI without running `npm install`/`npm start` at all. It won't reflect live app state (Electron IPC, real scraper runs) — use it purely for a quick visual demo.

## Configuration

- **Demo vs. live scraping.** The app runs the scraper in `--demo` mode (offline fixtures) by default. This is controlled by the `demo: true` flag passed into the `runScraper()` calls in `main.js`. To scrape live data instead of fixtures:
  1. Install the optional scraper dependencies:
     ```bash
     pip install requests beautifulsoup4
     ```
     (The scraper degrades gracefully to `urllib` + a regex parser without them, but real HTML parsing is more reliable with them installed.)
  2. Change `demo: true` to `demo: false` in the `runScraper` calls in `main.js` (or wire up a settings toggle).
- **No `.env` file or API keys are needed** — Singpass login and eligibility logic are both mocked/simulated for this build, and there is no external backend.
- **Where app data lives.** Persisted state (Singpass session, subscriptions, budget categories, spending logs) is written to `savewiser-data.json` inside Electron's per-OS `userData` directory (see `readState`/`writeState` in `main.js`) — delete that file if you ever want to reset the app to a clean state.

### If `npm install` shows `npm audit` warnings

Older checkouts may have picked up warnings from `electron-builder` (a packaging tool, not a dependency of this project) or a stale pinned Electron version. This project doesn't depend on `electron-builder`, and Electron is pinned to a current release. To pick up the fix in an existing checkout:

```bash
rm -rf node_modules package-lock.json
npm install
npm audit   # should report 0 vulnerabilities
```

## Project layout

```
savewiser/
  main.js              Electron main process: window, IPC, scraper bridge, JSON-file persistence
  preload.js           contextBridge -- exposes window.savewiser to the renderer
  preview.html          Self-contained instant demo (no install needed)
  src/
    index.html
    styles.css          Liquid Glass design system (#005EBA accent)
    app.js              Renderer app: routing, rendering, all interactions
    data/                Persona + curated announcements demo data (not deals)
  scraper/
    savewiser_deal_scraper.py   Government-assistance deals + the shared scrape/relevance/expiry/dedup pipeline
    supermarket_deals.py         Supermarket deals category (FairPrice/Giant/Cold Storage in live mode)
    amenities_deals.py           Amenities & F&B deals category (gyms, pharmacies, restaurants)
```

## Packaging installers (optional)

`npm start` is all you need for a demo. If you later want a distributable `.dmg` / `.exe` / `.AppImage`:

```bash
npm install --save-dev electron-builder@latest
npx electron-builder
```

The `build` config in `package.json` is already set up for macOS, Windows (NSIS) and Linux (AppImage) targets. `electron-builder` is deliberately left out of `devDependencies` until you need it, so you always pull whatever version is current and patched at packaging time.

## Notes / known limitations

- Persistence is a local JSON file, not a real backend — appropriate for a hackathon-scale build.
- Singpass login and scheme-eligibility checks are both mocked/simplified, not connected to real government systems.
- The amenities/F&B scraper's live (non-demo) site fetchers are unverified starting points, same as the original supermarket scraper.
- Budget Tracker currently supports monthly (not weekly) caps, and categories can't yet be deleted once created.
