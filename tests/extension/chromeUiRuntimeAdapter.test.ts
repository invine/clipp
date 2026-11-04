import { spawnSync } from "node:child_process";
import path from "node:path";

it("runs popup and options production adapters in Chrome extension contexts", () => {
  const harness = path.resolve(
    __dirname,
    "../harness/chrome-ui-runtime-adapter.mjs"
  );
  const result = spawnSync(process.execPath, [harness], {
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({
    browserExtensionContext: true,
    reactMounted: false,
    surfaces: ["popup", "options"],
    cases: expect.arrayContaining([
      "common-snapshot-conformance",
      "common-lifecycle-conformance",
      "surface-capabilities-and-popup-capture",
      "retired-popup-read-does-not-affect-replacement-or-options",
      "settings-and-history-authorities-remain-independent",
    ]),
    errors: [],
  });
});
