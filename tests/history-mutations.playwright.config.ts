import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "history-mutations.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4182",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "vite --config tests/harness/ui-behavior/vite.config.ts --port 4182",
    cwd: "..",
    url: "http://127.0.0.1:4182",
    reuseExistingServer: false,
  },
});
