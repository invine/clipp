import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "relay-management.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4180",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "vite --config tests/harness/ui-behavior/vite.config.ts --port 4180",
    cwd: "..",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
  },
});
