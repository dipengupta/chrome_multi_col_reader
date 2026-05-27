(function () {
  "use strict";

  let isActive = false;
  let hostEl = null;
  let shadowRoot = null;

  const THEMES = {
    white: { bg: "#ffffff", color: "#1a1a1a", border: "rgba(0,0,0,0.1)",   name: "white" },
    sepia: { bg: "#f5f0e8", color: "#3b2f2f", border: "rgba(0,0,0,0.12)",  name: "sepia" },
    dark:  { bg: "#1a1a1a", color: "#e0e0e0", border: "rgba(255,255,255,0.1)", name: "dark" },
  };

  const FONTS = {
    georgia:  "'Georgia', 'Times New Roman', serif",
    palatino: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    times:    "'Times New Roman', Times, serif",
    system:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  };

  // ── Content extraction ──────────────────────────────────────────────────────

  function extractTitle() {
    const selectors = [
      "h1.entry-title", "h1.article-title",
      "[data-testid*='title'] h1", "article h1", "main h1", "h1",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return document.title || "Article";
  }

  // Extract the Open Graph hero image from <head> — present on every news article
  function extractHeroImage() {
    const src = document.querySelector('meta[property="og:image"]')?.content;
    const alt = document.querySelector('meta[property="og:image:alt"]')?.content || "";
    return src ? { src, alt } : null;
  }

  const BODY_SELECTORS = [
    ".entry-content", ".post-content", ".article-content", ".article-body",
    "[class*='article-body']", "[class*='entry-content']",
    "[class*='post-content']", "[class*='story-body']",
    "article .content", "article", "main",
  ];

  const JUNK_SELECTORS = [
    "[class*='duet--ad--']",
    "[class*='duet--cta--newsletter']",
    "[class*='duet--layout--article-recirc']",
    "[class*='dynamic-native-ad']",
    "[class*='duet--article--share']",
    "nav", "footer",
    "script", "style", "noscript",
    "[class*='ad-unit']", "[class*='-advertisement']", "[class*='advertisement-']",
    "[id*='ad-unit']",
    "[class*='newsletter-signup']", "[class*='signup-form']",
    "[class*='comments-section']", "[class*='comment-section']",
    "[class*='sidebar']", "[class*='related-articles']",
    "[class*='promo-banner']",
    "video", "iframe",
  ];

  function qualityCheck(el) {
    if (el.textContent.trim().length < 300) return false;
    return Array.from(el.querySelectorAll("p"))
      .filter((p) => p.textContent.trim().length > 40).length >= 3;
  }

  function extractBody() {
    let container = null;

    // The Verge: each block is its own div.duet--article--article-body-component.
    // Their shared parent (div#zephr-anchor) holds all blocks.
    const vergeBlocks = document.querySelectorAll(
      '[class*="duet--article--article-body-component"]'
    );
    if (vergeBlocks.length > 0 && vergeBlocks[0].parentElement) {
      container = vergeBlocks[0].parentElement;
    }

    if (!container) {
      for (const sel of BODY_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) { container = el; break; }
      }
    }

    if (!container) return textDensityFallback();

    const clone = container.cloneNode(true);
    for (const sel of JUNK_SELECTORS) {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    }

    if (qualityCheck(clone)) return clone;
    return textDensityFallback();
  }

  function textDensityFallback() {
    const SKIP = ["nav", "footer", "aside", "header", "#mcr-host",
      "[role='navigation']", "[role='banner']", "[role='contentinfo']"];
    const valid = Array.from(document.querySelectorAll("p")).filter((p) => {
      if (p.textContent.trim().length < 60) return false;
      return !SKIP.some((sel) => p.closest(sel));
    });
    if (valid.length < 3) return null;
    const wrapper = document.createElement("div");
    valid.forEach((p) => wrapper.appendChild(p.cloneNode(true)));
    return wrapper;
  }

  // Fix images so they render properly inside our reader.
  // Next.js Image (data-nimg) uses position:absolute fill-layout — reset that.
  function processImages(el) {
    el.querySelectorAll("img").forEach((img) => {
      img.removeAttribute("loading");
      // Wipe Next.js / page inline styles that would collapse the image
      img.style.cssText =
        "max-width:100%;width:100%;height:auto;display:block;position:static;";
      // Handle data-src lazy loaders
      const lazySrc =
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-lazy");
      const curSrc = img.getAttribute("src") || "";
      if (lazySrc && (!curSrc || curSrc.startsWith("data:image/svg"))) {
        img.setAttribute("src", lazySrc);
      }
    });
  }

  function sanitizeHTML(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "");
  }

  // ── Overlay HTML ────────────────────────────────────────────────────────────
  // Options for <select> MUST be in the HTML template, not added via JS appendChild,
  // because Chrome has a known bug where programmatically appended <option> elements
  // inside a Shadow DOM <select> don't appear in the native dropdown.

  function buildOverlayHTML() {
    return `
      <div id="mcr-overlay">
        <div id="mcr-controls">
          <div class="mcr-control-group">
            <span class="mcr-label">Font</span>
            <select id="mcr-font-select">
              <option value="georgia">Georgia</option>
              <option value="palatino">Palatino</option>
              <option value="times">Times New Roman</option>
              <option value="system">System UI</option>
            </select>
          </div>
          <div class="mcr-control-group">
            <span class="mcr-label">Size</span>
            <input id="mcr-size-slider" type="range" min="14" max="24" step="1" value="18">
            <span id="mcr-size-label">18px</span>
          </div>
          <div class="mcr-control-group">
            <span class="mcr-label">Columns</span>
            <button class="mcr-col-btn active" data-col-width="480">Wider</button>
            <button class="mcr-col-btn" data-col-width="300">Narrower</button>
          </div>
          <div class="mcr-control-group">
            <span class="mcr-label">Theme</span>
            <button class="mcr-bg-swatch active" data-theme="white" title="White"
              style="background:#ffffff;border-color:rgba(0,0,0,0.25);"></button>
            <button class="mcr-bg-swatch" data-theme="sepia" title="Sepia"
              style="background:#f5f0e8;border-color:rgba(0,0,0,0.2);"></button>
            <button class="mcr-bg-swatch" data-theme="dark" title="Dark"
              style="background:#1a1a1a;border-color:rgba(255,255,255,0.35);"></button>
          </div>
          <button id="mcr-close">✕ Close</button>
        </div>
        <div id="mcr-scroll">
          <div id="mcr-article">
            <div id="mcr-article-header">
              <div id="mcr-hero"></div>
              <div id="mcr-title"></div>
            </div>
            <div id="mcr-body"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Controls wiring ─────────────────────────────────────────────────────────

  function buildControls(shadow, state) {
    const fontSel = shadow.getElementById("mcr-font-select");
    // Options are already in the HTML — just set the initial value
    fontSel.value = state.font;
    fontSel.addEventListener("change", () => applyFont(shadow, fontSel.value, state));

    const slider = shadow.getElementById("mcr-size-slider");
    const sizeLabel = shadow.getElementById("mcr-size-label");
    slider.value = state.size;
    sizeLabel.textContent = state.size + "px";
    slider.addEventListener("input", () => {
      state.size = parseInt(slider.value, 10);
      sizeLabel.textContent = state.size + "px";
      applySize(shadow, state.size);
    });

    shadow.querySelectorAll(".mcr-col-btn").forEach((btn) => {
      if (parseInt(btn.dataset.colWidth, 10) === state.colWidth) btn.classList.add("active");
      else btn.classList.remove("active");
      btn.addEventListener("click", () => {
        shadow.querySelectorAll(".mcr-col-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.colWidth = parseInt(btn.dataset.colWidth, 10);
        applyColumnWidth(shadow, state.colWidth);
      });
    });

    shadow.querySelectorAll(".mcr-bg-swatch").forEach((swatch) => {
      if (swatch.dataset.theme === state.theme) swatch.classList.add("active");
      else swatch.classList.remove("active");
      swatch.addEventListener("click", () => {
        shadow.querySelectorAll(".mcr-bg-swatch").forEach((s) => s.classList.remove("active"));
        swatch.classList.add("active");
        state.theme = swatch.dataset.theme;
        applyTheme(shadow, state.theme);
      });
    });

    shadow.getElementById("mcr-close").addEventListener("click", deactivate);
  }

  function applyFont(shadow, fontKey, state) {
    state.font = fontKey;
    shadow.getElementById("mcr-overlay").style.setProperty("--mcr-font", FONTS[fontKey]);
  }

  function applySize(shadow, size) {
    shadow.getElementById("mcr-overlay").style.setProperty("--mcr-size", size + "px");
  }

  function applyColumnWidth(shadow, px) {
    shadow.getElementById("mcr-overlay").style.setProperty("--mcr-col-width", px + "px");
  }

  function applyTheme(shadow, themeName) {
    const overlay = shadow.getElementById("mcr-overlay");
    const t = THEMES[themeName];
    overlay.style.setProperty("--mcr-bg", t.bg);
    overlay.style.setProperty("--mcr-color", t.color);
    overlay.style.setProperty("--mcr-border", t.border);
    overlay.dataset.theme = t.name;
  }

  // ── Activate / deactivate ───────────────────────────────────────────────────

  function activate() {
    if (isActive) return;

    const title = extractTitle();
    const hero  = extractHeroImage();
    const bodyContent = extractBody();

    hostEl = document.createElement("div");
    hostEl.id = "mcr-host";
    document.body.appendChild(hostEl);

    shadowRoot = hostEl.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("reader.css");
    shadowRoot.appendChild(link);

    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildOverlayHTML();
    shadowRoot.appendChild(wrapper.firstElementChild);

    // Title
    shadowRoot.getElementById("mcr-title").textContent = title;

    // Hero image (from OG meta tag)
    if (hero) {
      const heroEl = shadowRoot.getElementById("mcr-hero");
      const img = document.createElement("img");
      img.src = hero.src;
      img.alt = hero.alt;
      img.id = "mcr-hero-img";
      heroEl.appendChild(img);
    }

    // Body
    const bodyEl = shadowRoot.getElementById("mcr-body");
    if (bodyContent) {
      processImages(bodyContent);
      bodyEl.innerHTML = sanitizeHTML(bodyContent.innerHTML);
    } else {
      const noArticle = document.createElement("div");
      noArticle.id = "mcr-no-article";
      noArticle.innerHTML = `
        <h2>No article found</h2>
        <p>Navigate to an article page and try again.</p>
      `;
      shadowRoot.getElementById("mcr-article").replaceChild(noArticle, bodyEl);
    }

    const state = { font: "georgia", size: 18, colWidth: 400, theme: "white" };
    applyTheme(shadowRoot, state.theme);
    applyColumnWidth(shadowRoot, state.colWidth);
    buildControls(shadowRoot, state);

    // Hide original page entirely — no blur, no scrollbar bleed-through
    document.documentElement.classList.add("mcr-active");
    document.body.classList.add("mcr-active");

    document.addEventListener("keydown", onKeyDown);
    isActive = true;
  }

  function deactivate() {
    if (!isActive) return;
    if (hostEl) {
      hostEl.remove();
      hostEl = null;
      shadowRoot = null;
    }
    document.documentElement.classList.remove("mcr-active");
    document.body.classList.remove("mcr-active");
    document.removeEventListener("keydown", onKeyDown);
    isActive = false;
  }

  function onKeyDown(e) {
    if (e.key === "Escape") deactivate();
  }

  // ── Message listener ────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "toggle-reader") {
      isActive ? deactivate() : activate();
      sendResponse({ ok: true });
    }
  });

  // ── Test hooks ──────────────────────────────────────────────────────────────
  document.addEventListener("mcr-test-activate", () => activate());
  document.addEventListener("mcr-test-deactivate", () => deactivate());
})();
