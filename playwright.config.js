const { defineConfig } = require("@playwright/test");
const path = require("path");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "node tests/server.js",
    port: 4321,
    reuseExistingServer: true,
  },
  use: {
    // Extension tests need a real browser (not headless)
    headless: false,
    viewport: { width: 1440, height: 900 },
    baseURL: "http://localhost:4321",
  },
  // Chromium only — extensions aren't supported in Firefox/WebKit
  projects: [
    {
      name: "chromium-extension",
      use: { channel: "chromium" },
    },
  ],
});
