# SaveWiser

Save smarter. A Liquid-Glass-styled Electron desktop app for Singapore: AI-scraped deals, Singpass-gated government assistance announcements, and company-sponsored savings challenges.

## Features

1. **Deals** -- amenities & F&B (gyms, pharmacies, restaurants), supermarket promos, and official government-assistance deals, all surfaced by `scraper/savewiser_deal_scraper.py` (the same scrape -> relevance -> expiry -> dedup -> output pipeline, extended with a third `amenities_deals.py` category).
2. **Announcements** -- a mock Singpass login unlocks a subscribable feed of government financial-assistance schemes (curated + live from the scraper's official sources), with a simple per-scheme eligibility hint based on the demo persona.
3. **Savings Challenges** -- log daily savings toward challenges sponsored by NTUC and other partners; progress bars, completion badges, and a savings-statement chart.

## Running it

```bash
npm install     # installs Electron (first run downloads the Electron binary)
npm start
```

Requires **Python 3** on your PATH (as `python3`, or `python` on Windows) for the deals scraper -- no pip packages are required for the default demo mode (`--demo` uses offline fixtures and only needs the standard library). For live scraping, install the optional extras:

```bash
pip install requests beautifulsoup4
```

...and change the `demo: true` flag in `main.js`'s `runScraper` calls (or wire up a settings toggle) to run the scraper against the real web instead of its fixtures. This build ships with `demo: true` by default, matching the project's own decision to keep the initial build fully mocked/demo data.

### If you already ran `npm install` and saw `npm audit` warnings

Those were coming from `electron-builder` (a packaging tool, pulled in transitively via `tar`/`extract-zip`) and an outdated pinned `electron` version -- neither is a vulnerability in SaveWiser's own code, but there's no reason to carry them for a `npm start` demo. This project no longer depends on `electron-builder` at all, and `electron` is pinned to a current release. To pick up the fix in an existing checkout:

```bash
rm -rf node_modules package-lock.json
npm install
npm audit   # should now report 0 vulnerabilities
```

### Packaging installers (optional, later)

`npm start` (above) is all you need for the hackathon demo -- it runs the app directly, no packaging required. If you later want a distributable `.dmg`/`.exe`/`.AppImage`, install `electron-builder` yourself at that time (so you get whatever version is current and patched then, rather than one pinned months ago):

```bash
npm install --save-dev electron-builder@latest
npx electron-builder
```

The `build` config in `package.json` is already set up for this.

## Project layout

```
savewiser/
  main.js            Electron main process: window, IPC, scraper bridge, JSON-file persistence
  preload.js          contextBridge -- exposes window.savewiser to the renderer
  src/
    index.html
    styles.css        Liquid Glass design system (#005EBA accent)
    app.js            renderer app: routing, rendering, all interactions
    data/mock.js       persona + curated announcements/challenges (demo data only -- NOT deals)
  scraper/
    savewiser_deal_scraper.py   government-assistance + pipeline (your file, extended)
    supermarket_deals.py         real chains for live scraping (FairPrice/Giant/Cold Storage); demo fixtures are fictional (your file, extended)
    amenities_deals.py           NEW: gyms/pharmacy/F&B category; demo fixtures are fictional
```

## Design

Styled after Apple's Liquid Glass: translucent, blurred panels (`backdrop-filter`), a floating pill header and bottom nav, and a single accent color, `#005EBA`, throughout. On macOS the window itself is transparent with real vibrancy (the desktop blurs through it); on Windows/Linux the glass effect comes from CSS blur over the app's own gradient background, since true window vibrancy isn't reliably available there.

## Data

Everything is demo/mocked per the project's own decision, **except** the deals feed, which really runs `scraper/savewiser_deal_scraper.py --demo` as a child process and renders its actual JSON output. Singpass, savings logs, challenge progress and announcement subscriptions persist to a small JSON file in the OS's app-data directory (see `readState`/`writeState` in `main.js`) -- no cloud backend, matching the hackathon-scale scope of this build.

### Copyright/trademark-safe demo deals

The three demo-mode deal fixtures (`amenities_deals.py`, `supermarket_deals.py`, and the "gov" fixture in `savewiser_deal_scraper.py`) use fictional brand names -- WellPoint Pharmacy, FlexZone Fitness, Golden Dumpling House, Leaf & Brew Tea Co., Wok Master Kitchen, Trattoria Bella, ValueMart, MegaGrocer, FreshHaven Market -- instead of the real chains, so a presentation or pitch deck built on this app's demo mode never shows a fabricated discount attributed to a real, trademarked company. Government scheme names (CDC Vouchers, MOE FAS, GST Voucher, ComCare, ...) and the blog/media source labels used for attribution (SingPromos, MoneyDigest SG, ...) are left as-is -- those are the real public schemes and real citation sources the Announcements feature is built to surface, not fabricated commercial offers.

This only affects `--demo` mode (what `main.js` runs today, and what ships in `preview.html`). The real, live-scraping code paths (`fetch_fairprice`/`fetch_giant`/`fetch_cold_storage` in `supermarket_deals.py`, the aggregator-mention and direct-site strategies in `amenities_deals.py`) are untouched and still target the real chains for an actual deployment.
