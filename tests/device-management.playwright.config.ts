import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "device-management.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4181",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "vite --config tests/harness/ui-behavior/vite.config.ts --port 4181",
    cwd: "..",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
  },
});
