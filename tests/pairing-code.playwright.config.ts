import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-behavior",
  testMatch: "pairing-code-and-scan.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command:
      "vite --config tests/harness/ui-behavior/vite.config.ts --port 4178",
    cwd: "..",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
  },
});
