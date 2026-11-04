import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "vite --config tests/harness/ui-behavior/vite.config.ts",
    cwd: "..",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: !process.env.CI,
  },
});
