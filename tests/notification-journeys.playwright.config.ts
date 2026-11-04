import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "notification-journeys.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4183",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "vite --config tests/harness/ui-behavior/vite.config.ts --port 4183",
    cwd: "..",
    url: "http://127.0.0.1:4183",
    reuseExistingServer: false,
  },
});
