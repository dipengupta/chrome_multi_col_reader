const { test, expect, chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const os = require("os");

const EXTENSION_PATH = path.resolve(__dirname, "../..");
const ARTICLE_URL = "http://localhost:4321/verge-article.html";
const HOMEPAGE_URL = "http://localhost:4321/verge-homepage.html";

// Shadow DOM helpers — all shadow DOM access must go through evaluate()
// because Playwright can't pierce extension shadow roots via locators directly.

async function shadowQuery(page, selector) {
  return page.evaluate((sel) => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return null;
    const el = host.shadowRoot.querySelector(sel);
    return el ? el.textContent.trim() : null;
  }, selector);
}

async function shadowQueryAll(page, selector) {
  return page.evaluate((sel) => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return [];
    return Array.from(host.shadowRoot.querySelectorAll(sel)).map((el) =>
      el.outerHTML
    );
  }, selector);
}

async function shadowExists(page) {
  return page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    return !!(host && host.shadowRoot && host.shadowRoot.getElementById("mcr-overlay"));
  });
}

async function triggerActivate(page) {
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("mcr-test-activate"))
  );
  // Wait for shadow DOM to be populated
  await page.waitForFunction(() => {
    const host = document.getElementById("mcr-host");
    return !!(host && host.shadowRoot && host.shadowRoot.getElementById("mcr-overlay"));
  }, { timeout: 5000 });
}

async function triggerDeactivate(page) {
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("mcr-test-deactivate"))
  );
  await page.waitForFunction(() => !document.getElementById("mcr-host"), { timeout: 5000 });
}

// ── Browser context setup ───────────────────────────────────────────────────

let browserContext;
let page;

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcr-test-"));
  browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
    viewport: { width: 1440, height: 900 },
  });
  page = await browserContext.newPage();
});

test.afterAll(async () => {
  await browserContext.close();
});

test.beforeEach(async () => {
  // Navigate to the article fixture before each test
  await page.goto(ARTICLE_URL, { waitUntil: "domcontentloaded" });
  // Ensure any leftover overlay is dismissed
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    if (host) host.remove();
    document.documentElement.classList.remove("mcr-active");
    document.body.classList.remove("mcr-active");
  });
});

// ── Tests ───────────────────────────────────────────────────────────────────

test("1 — overlay appears on activation", async () => {
  await triggerActivate(page);
  const visible = await shadowExists(page);
  expect(visible).toBe(true);
});

test("2 — article title is extracted correctly", async () => {
  await triggerActivate(page);
  const title = await shadowQuery(page, "#mcr-title");
  expect(title).toBeTruthy();
  expect(title.toLowerCase()).toContain("microsoft");
});

test("3 — at least 8 paragraphs rendered in the body", async () => {
  await triggerActivate(page);
  const count = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return 0;
    return host.shadowRoot.getElementById("mcr-body").querySelectorAll("p").length;
  });
  expect(count).toBeGreaterThanOrEqual(8);
});

test("4 — at least 2 images appear in the body", async () => {
  await triggerActivate(page);
  const count = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return 0;
    return host.shadowRoot.getElementById("mcr-body").querySelectorAll("img").length;
  });
  expect(count).toBeGreaterThanOrEqual(2);
});

test("4b — hero image from OG meta tag appears above the article body", async () => {
  await triggerActivate(page);
  const heroSrc = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return null;
    const img = host.shadowRoot.getElementById("mcr-hero-img");
    return img ? img.getAttribute("src") : null;
  });
  expect(heroSrc).toBeTruthy();
  expect(heroSrc.length).toBeGreaterThan(10);
});

test("5 — ad block is stripped from reader", async () => {
  await triggerActivate(page);
  const adText = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return "";
    return host.shadowRoot.getElementById("mcr-body").textContent;
  });
  expect(adText).not.toContain("ADVERTISEMENT");
  expect(adText).not.toContain("should NOT appear");
});

test("6 — recirc and newsletter blocks are stripped", async () => {
  await triggerActivate(page);
  const bodyText = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return "";
    return host.shadowRoot.getElementById("mcr-body").textContent;
  });
  expect(bodyText).not.toContain("Related stories");
  expect(bodyText).not.toContain("Subscribe to our newsletter");
});

test("7 — original page content is hidden when reader is active", async () => {
  await triggerActivate(page);
  const originalHidden = await page.evaluate(() => {
    // All body children except #mcr-host should be hidden via CSS
    // Check that the mcr-active class is on both html and body
    return (
      document.documentElement.classList.contains("mcr-active") &&
      document.body.classList.contains("mcr-active")
    );
  });
  expect(originalHidden).toBe(true);
});

test("8 — close button restores page and removes mcr-active", async () => {
  await triggerActivate(page);
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    host.shadowRoot.getElementById("mcr-close").click();
  });
  await page.waitForFunction(() => !document.getElementById("mcr-host"));
  const active = await page.evaluate(() =>
    document.body.classList.contains("mcr-active")
  );
  expect(active).toBe(false);
});

test("9 — Escape key dismisses overlay", async () => {
  await triggerActivate(page);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("mcr-host"));
  const hostGone = await page.evaluate(() => !document.getElementById("mcr-host"));
  expect(hostGone).toBe(true);
});

test("10 — column toggle applies --mcr-col-width custom property", async () => {
  await triggerActivate(page);
  // Click the "Narrower" button (300px column width)
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    host.shadowRoot.querySelector('[data-col-width="300"]').click();
  });
  const colWidth = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    return host.shadowRoot
      .getElementById("mcr-overlay")
      .style.getPropertyValue("--mcr-col-width")
      .trim();
  });
  expect(colWidth).toBe("300px");
});

test("11 — sepia theme swatch updates --mcr-bg", async () => {
  await triggerActivate(page);
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    host.shadowRoot.querySelector('[data-theme="sepia"]').click();
  });
  const bg = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    return host.shadowRoot
      .getElementById("mcr-overlay")
      .style.getPropertyValue("--mcr-bg")
      .trim();
  });
  expect(bg).toBe("#f5f0e8");
});

test("12 — dark theme swatch updates --mcr-bg", async () => {
  await triggerActivate(page);
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    host.shadowRoot.querySelector('[data-theme="dark"]').click();
  });
  const bg = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    return host.shadowRoot
      .getElementById("mcr-overlay")
      .style.getPropertyValue("--mcr-bg")
      .trim();
  });
  expect(bg).toBe("#1a1a1a");
});

test("13 — font selector changes --mcr-font", async () => {
  await triggerActivate(page);
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    const sel = host.shadowRoot.getElementById("mcr-font-select");
    sel.value = "palatino";
    sel.dispatchEvent(new Event("change"));
  });
  const font = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    return host.shadowRoot
      .getElementById("mcr-overlay")
      .style.getPropertyValue("--mcr-font")
      .trim();
  });
  expect(font).toContain("Palatino");
});

test("14 — font size slider changes --mcr-size", async () => {
  await triggerActivate(page);
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    const slider = host.shadowRoot.getElementById("mcr-size-slider");
    slider.value = "22";
    slider.dispatchEvent(new Event("input"));
  });
  const size = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    return host.shadowRoot
      .getElementById("mcr-overlay")
      .style.getPropertyValue("--mcr-size")
      .trim();
  });
  expect(size).toBe("22px");
});

test("15 — activating twice does not create duplicate overlays", async () => {
  await triggerActivate(page);
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("mcr-test-activate"))
  );
  const hostCount = await page.evaluate(() =>
    document.querySelectorAll("#mcr-host").length
  );
  expect(hostCount).toBe(1);
});

test("16 — no-article page shows fallback message", async () => {
  await page.goto(HOMEPAGE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("mcr-test-activate"))
  );
  await page.waitForFunction(() => {
    const host = document.getElementById("mcr-host");
    return !!(host && host.shadowRoot);
  });
  const noArticleText = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    if (!host || !host.shadowRoot) return "";
    const el = host.shadowRoot.getElementById("mcr-no-article");
    return el ? el.textContent : "";
  });
  expect(noArticleText).toContain("No article found");
});

test("17 — Aero style sets data-style attribute on overlay", async () => {
  await triggerActivate(page);
  await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    host.shadowRoot.querySelector('[data-style="aero"]').click();
  });
  const style = await page.evaluate(() => {
    const host = document.getElementById("mcr-host");
    return host.shadowRoot.getElementById("mcr-overlay").dataset.style;
  });
  expect(style).toBe("aero");
});
