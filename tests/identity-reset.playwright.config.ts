import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "identity-reset.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4184",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "vite --config tests/harness/ui-behavior/vite.config.ts --port 4184 --strictPort",
    cwd: "..",
    url: "http://127.0.0.1:4184/identity-reset.html",
    reuseExistingServer: false,
  },
});
