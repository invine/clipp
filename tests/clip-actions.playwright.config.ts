import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "share-reuse.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4181",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "vite --config tests/harness/ui-behavior/vite.config.ts --port 4181 --strictPort",
    cwd: "..",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
  },
});
