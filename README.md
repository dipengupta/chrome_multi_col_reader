# Multi-Column Reader — Chrome Extension

A Chrome MV3 extension that reformats news articles into a newspaper-style multi-column layout. Click the toolbar icon on any Verge article to enter reader mode; the original page is hidden and replaced by a clean, configurable reading experience.

![reader screenshot placeholder](icons/icon128.png)

---

## Features

- **Newspaper spread layout** — content fills the full viewport width and flows into as many columns as needed. Long articles extend rightward with a horizontal scrollbar; there is never a vertical scrollbar.
- **Hero image beside title** — the OG image is shown as a small thumbnail (≈160px) next to the article title rather than as a full-width banner.
- **Column width toggle** — "Wider" (480px columns) or "Narrower" (300px columns); the browser auto-calculates how many columns fit.
- **Font selector** — Georgia, Palatino, Times New Roman, System UI.
- **Font size slider** — 14px–24px, live preview.
- **Theme swatches** — White, Sepia, Dark.
- **Keyboard shortcut** — `Escape` closes the reader.
- **Ad / junk stripping** — ads, newsletter CTAs, and related-article recirculation blocks are removed from the extracted content.
- **Shadow DOM isolation** — the reader UI lives in a Shadow DOM so its styles never bleed into or out of the host page.

---

## Architecture

```
manifest.json          MV3 manifest — permissions, content script, icons
background.js          Service worker — handles toolbar click, injects content script if needed
content.js             Content script — extraction, Shadow DOM overlay, controls
reader.css             Styles for the Shadow DOM overlay (loaded as a web-accessible resource)
icons/                 Extension icons (16, 48, 128 px)
tests/
  server.js            Minimal static file server for Playwright fixtures (port 4321)
  fixtures/
    verge-article.html   Mirrors real Verge article DOM structure (used by E2E tests)
    verge-homepage.html  Page with no article body (tests "No article found" fallback)
  e2e/
    reader.spec.js     17 Playwright end-to-end tests
```

### Key design decisions

| Decision | Reason |
|---|---|
| Shadow DOM (`mode: "open"`) | Isolates reader styles from the host page CSS; prevents conflicts on complex sites like The Verge |
| `body.mcr-active > *:not(#mcr-host) { display: none }` | Hides the original page entirely — cleaner than blur/opacity hacks which let the host scrollbar bleed through |
| `overflow: hidden` on both `<html>` and `<body>` | Only hiding `<body>` still lets the root element scroll; both must be targeted |
| CSS `column-width` (not `column-count`) | Lets the browser auto-fill columns to fill available width; content never overflows vertically |
| `#mcr-scroll { overflow-x: auto; overflow-y: hidden }` | Implements the horizontal newspaper-spread scroll |
| `<option>` elements in HTML template string | Chrome has a bug where `<option>` elements appended via `appendChild()` inside a Shadow DOM `<select>` do not appear in the native dropdown |
| `querySelectorAll('.duet--article--article-body-component')` + `[0].parentElement` | The Verge wraps every block (paragraph, image, ad) in its own `div`; `querySelector` returns only the first one. Taking the shared parent (`#zephr-anchor`) gets all blocks |
| Custom DOM events (`mcr-test-activate`) | Cross the content-script isolated-world boundary so Playwright can trigger activation without needing a real toolbar click |

---

## Installation

1. Clone or download this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repo root folder.
5. The Multi-Column Reader icon will appear in your toolbar.

---

## Usage

1. Navigate to any article on [The Verge](https://www.theverge.com).
2. Click the **Multi-Column Reader** toolbar icon (or pin it first via the puzzle-piece menu).
3. The reader overlay opens. Use the controls bar to adjust font, size, column width, and theme.
4. Press **Escape** or click **✕ Close** to return to the original page.

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Install test dependencies

```bash
npm install
npx playwright install chromium
```

### Run the test suite

```bash
npm test
```

Tests run in a real Chromium browser (headless mode is disabled — Chrome does not support loading extensions in headless mode). A fixture server starts automatically on port 4321.

```
npm run test:debug   # step through tests in Playwright Inspector
npm run test:ui      # Playwright UI mode
```

### After editing extension files

Go to `chrome://extensions` and click the **reload** icon on the Multi-Column Reader card. There is no build step — all files are loaded directly.

---

## Supported sites

Currently tuned for **The Verge** (detects `div.duet--article--article-body-component` blocks). The generic fallback selectors (`.article-body`, `.entry-content`, `article`, etc.) and text-density heuristic make it usable on many other article pages without site-specific configuration.

---

## License

MIT
