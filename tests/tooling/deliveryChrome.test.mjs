import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inspectChromeBuild,
  replaceChromeDestination,
  verifyLoadedChrome,
  deliverChrome,
} from "../../scripts/delivery/chrome.mjs";
import { acquireOwnership } from "../../scripts/delivery/ownership.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "clipp-delivery-chrome-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, "checkout/apps/extension/dist");
  mkdirSync(path.join(dist, "src"), { recursive: true });
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  writeFileSync(
    path.join(dist, "service-worker-loader.js"),
    "import './assets/background.js';"
  );
  writeFileSync(path.join(dist, "assets/background.js"), "self.CLIPP = true;");
  writeFileSync(
    path.join(dist, "offscreen.html"),
    '<script type="module" src="/assets/offscreen.js"></script>'
  );
  writeFileSync(
    path.join(dist, "assets/offscreen.js"),
    "self.CLIPP_OFFSCREEN = true;"
  );
  writeFileSync(
    path.join(dist, "src/popup.html"),
    '<script type="module" src="/assets/popup.js"></script>'
  );
  writeFileSync(
    path.join(dist, "assets/popup.js"),
    "document.body.textContent='Ready';"
  );
  writeFileSync(path.join(dist, "src/options.html"), "<body>Options</body>");
  writeFileSync(path.join(dist, "icon.png"), "icon");
  writeFileSync(
    path.join(dist, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      version: "0.1.0",
      background: {
        service_worker: "service-worker-loader.js",
        type: "module",
      },
      action: {
        default_popup: "src/popup.html",
        default_icon: { 16: "icon.png" },
      },
      options_page: "src/options.html",
      icons: { 16: "icon.png" },
      web_accessible_resources: [{ resources: ["offscreen.html"] }],
    })
  );
  return { root, dist };
}

test("Chrome production inventory requires the offscreen, worker and popup assets", (t) => {
  const { dist } = fixture(t);
  const inspected = inspectChromeBuild(dist);
  assert.equal(inspected.manifest.version, "0.1.0");
  assert.ok(inspected.inventory["assets/offscreen.js"]);
  rmSync(path.join(dist, "assets/offscreen.js"));
  assert.throws(
    () => inspectChromeBuild(dist),
    /missing.*offscreen|offscreen.*missing/i
  );
  writeFileSync(
    path.join(dist, "assets/offscreen.js"),
    "self.CLIPP_OFFSCREEN = true;"
  );
  rmSync(path.join(dist, "assets/popup.js"));
  assert.throws(
    () => inspectChromeBuild(dist),
    /missing.*popup|popup.*missing/i
  );
});

test("Chrome destination replacement removes stale files and retains a recoverable backup", (t) => {
  const { root, dist } = fixture(t);
  const stable = path.join(root, "stable");
  mkdirSync(stable);
  writeFileSync(path.join(stable, "stale.txt"), "old");
  const artifact = inspectChromeBuild(dist);
  const result = replaceChromeDestination({
    source: dist,
    destination: stable,
    expected: artifact.inventory,
    backupRoot: path.join(root, "backups"),
  });
  assert.equal(result.state, "replaced");
  assert.equal(
    readFileSync(path.join(result.backup, "stale.txt"), "utf8"),
    "old"
  );
  assert.throws(() => readFileSync(path.join(stable, "stale.txt")), /ENOENT/);
  assert.ok(readFileSync(path.join(stable, "manifest.json")));
});

test("Chrome loaded confirmation rejects a stale marker even when the marketing version matches", (t) => {
  const { root, dist } = fixture(t);
  const artifact = inspectChromeBuild(dist);
  const buildId = sha(JSON.stringify(artifact.inventory));
  const expected = {
    profilePath: path.join(root, "profile"),
    extensionPath: path.join(root, "stable"),
    extensionId: "a".repeat(32),
    buildId,
  };
  assert.throws(
    () =>
      verifyLoadedChrome(expected, {
        ...expected,
        buildId: "old",
        popupReady: true,
      }),
    /build identity/i
  );
  assert.throws(
    () =>
      verifyLoadedChrome(expected, {
        ...expected,
        extensionPath: path.join(root, "old"),
        popupReady: true,
      }),
    /loaded path/i
  );
  assert.doesNotThrow(() =>
    verifyLoadedChrome(expected, { ...expected, popupReady: true })
  );
});

test("Chrome run retains an immutable artifact but does not replace a destination without matching authorization", async (t) => {
  const { root, dist } = fixture(t);
  const destination = path.join(root, "stable");
  mkdirSync(destination);
  writeFileSync(path.join(destination, "previous.txt"), "preserve");
  const plan = {
    source: { commit: "a".repeat(40) },
    outputRoot: path.join(root, "run"),
    profile: { sha256: "b".repeat(64), chromeLocal: { checks: [] } },
    privateReferences: {},
    targets: {
      "chrome-local": {
        destinationIdentity: destination,
        profilePath: path.join(root, "profile"),
      },
    },
  };
  mkdirSync(plan.outputRoot);
  const run = {
    checkout: path.join(root, "checkout"),
    artifacts: { extension: inspectChromeBuild(dist).inventory },
    stages: { chromeLocal: { state: "pending", attempts: [] } },
    targets: { "chrome-local": { state: "pending" } },
  };
  await deliverChrome({
    plan,
    run,
    execute: async () => assert.fail("no gates"),
    save: () => {},
    observe: async () => assert.fail("no browser"),
  });
  assert.equal(run.targets["chrome-local"].state, "blocked");
  assert.equal(
    readFileSync(path.join(destination, "previous.txt"), "utf8"),
    "preserve"
  );
  assert.ok(run.stages.chromeLocal.artifact);
});

test("Chrome destination cannot resolve into the isolated source checkout", async (t) => {
  const { root, dist } = fixture(t);
  const plan = {
    source: { commit: "a".repeat(40) },
    outputRoot: path.join(root, "run"),
    profile: { sha256: "b".repeat(64), chromeLocal: { checks: [] } },
    privateReferences: {},
    targets: {
      "chrome-local": {
        destinationIdentity: path.join(root, "checkout/stable"),
        profilePath: path.join(root, "profile"),
      },
    },
  };
  mkdirSync(plan.outputRoot);
  const run = {
    checkout: path.join(root, "checkout"),
    artifacts: { extension: inspectChromeBuild(dist).inventory },
    stages: { chromeLocal: { state: "pending", attempts: [] } },
    targets: { "chrome-local": { state: "pending" } },
  };
  await assert.rejects(
    deliverChrome({
      plan,
      run,
      execute: async () => {},
      save: () => {},
      observe: async () => null,
    }),
    /outside.*checkout|inside.*checkout/i
  );
});

test("Chrome replacement blocks for loaded-build handoff, then confirms and replays without copying again", async (t) => {
  const { root, dist } = fixture(t);
  const destination = path.join(root, "stable");
  const profilePath = path.join(root, "owned-profile");
  mkdirSync(destination);
  writeFileSync(path.join(destination, "old.txt"), "old");
  const authorization = path.join(root, "authorization.json");
  writeFileSync(
    authorization,
    JSON.stringify({
      schema: 1,
      scope: "local-chrome-extension",
      sourceRevision: "a".repeat(40),
      destination,
      profilePath,
      authorizedBy: "fixture user instruction",
    })
  );
  const plan = {
    source: { commit: "a".repeat(40) },
    outputRoot: path.join(root, "run"),
    profile: { sha256: "b".repeat(64), chromeLocal: { checks: [] } },
    privateReferences: { chromeAuthorizationRef: `file:${authorization}` },
    targets: {
      "chrome-local": { destinationIdentity: destination, profilePath },
    },
  };
  mkdirSync(plan.outputRoot);
  const run = {
    checkout: path.join(root, "checkout"),
    artifacts: { extension: inspectChromeBuild(dist).inventory },
    stages: { chromeLocal: { state: "pending", attempts: [] } },
    targets: { "chrome-local": { state: "pending" } },
  };
  const base = {
    plan,
    run,
    execute: async () => assert.fail("no gates"),
    save: () => {},
  };
  await deliverChrome({ ...base, observe: async () => null });
  assert.equal(run.targets["chrome-local"].state, "blocked");
  assert.equal(run.stages.chromeLocal.replacement.confirmed, true);
  assert.throws(
    () => readFileSync(path.join(destination, "old.txt")),
    /ENOENT/
  );
  const replacementTime = run.stages.chromeLocal.replacement.startedAt;
  await deliverChrome({
    ...base,
    observe: async ({ expected }) => ({
      ...expected,
      extensionId: "a".repeat(32),
      popupReady: true,
    }),
  });
  assert.equal(run.targets["chrome-local"].state, "complete");
  assert.equal(run.stages.chromeLocal.replacement.startedAt, replacementTime);
  await deliverChrome({
    ...base,
    observe: async () => assert.fail("completed run must not reopen browser"),
  });
  assert.equal(run.targets["chrome-local"].state, "complete");
  writeFileSync(path.join(destination, "delivery-build.json"), "tampered");
  await assert.rejects(
    deliverChrome({
      ...base,
      observe: async () => assert.fail("tampered replay"),
    }),
    /destination changed|artifact changed/i
  );
});

test("a competing run cannot replace the same Chrome directory and profile", async (t) => {
  const { root, dist } = fixture(t);
  const destination = path.join(root, "stable");
  const profilePath = path.join(root, "profile");
  mkdirSync(destination);
  writeFileSync(path.join(destination, "old.txt"), "unchanged");
  const auth = path.join(root, "auth.json");
  writeFileSync(
    auth,
    JSON.stringify({
      schema: 1,
      scope: "local-chrome-extension",
      sourceRevision: "a".repeat(40),
      destination,
      profilePath,
      authorizedBy: "fixture",
    })
  );
  const plan = {
    source: { commit: "a".repeat(40) },
    outputRoot: path.join(root, "run"),
    profile: { sha256: "b".repeat(64), chromeLocal: { checks: [] } },
    privateReferences: { chromeAuthorizationRef: `file:${auth}` },
    targets: {
      "chrome-local": { destinationIdentity: destination, profilePath },
    },
  };
  mkdirSync(plan.outputRoot);
  const run = {
    checkout: path.join(root, "checkout"),
    artifacts: { extension: inspectChromeBuild(dist).inventory },
    stages: { chromeLocal: { state: "pending", attempts: [] } },
    targets: { "chrome-local": { state: "pending" } },
  };
  const release = acquireOwnership(
    `chrome-destination:${destination}:profile:${profilePath}`
  );
  try {
    await assert.rejects(
      deliverChrome({
        plan,
        run,
        execute: async () => {},
        save: () => {},
        observe: async () => null,
      }),
      /resource_owned/
    );
    assert.equal(
      readFileSync(path.join(destination, "old.txt"), "utf8"),
      "unchanged"
    );
  } finally {
    release();
  }
});
