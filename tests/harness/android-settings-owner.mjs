import { build } from "esbuild";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

// Actual AndroidClient and native Preferences storage seam; no runtime start,
// network, native plugin, host clipboard, user profile or global setting access.
const repo = fileURLToPath(new URL("../..", import.meta.url));
await mkdir(join(repo, ".local"), { recursive: true });
const own = await mkdtemp(join(repo, ".local", "android-settings-owner-"));
const outputArgument = process.argv
  .slice(2)
  .find((value) => !value.startsWith("--"));
const out = outputArgument ? resolve(outputArgument) : own;
const themeWrite = process.argv.includes("--theme-write");
await mkdir(out, { recursive: true });
const fixture = join(out, "client.mjs");
await build({
  stdin: {
    contents: `export {AndroidClient} from '${repo}/apps/android/src/client';export {LocalStorageBackend} from '${repo}/apps/android/src/storage';`,
    loader: "ts",
    resolveDir: repo,
  },
  bundle: true,
  platform: "node",
  packages: "external",
  format: "esm",
  outfile: fixture,
  plugins: [
    {
      name: "inert-system-boundaries",
      setup(builder) {
        builder.onResolve(
          { filter: /^@capacitor\/(clipboard|local-notifications)$/ },
          (args) => ({ path: args.path, namespace: "fixture-system" })
        );
        builder.onLoad(
          { filter: /.*/, namespace: "fixture-system" },
          (args) => ({
            contents: args.path.endsWith("clipboard")
              ? 'export const Clipboard={read:async()=>({value:""}),write:async()=>{},addListener:async()=>({remove:async()=>{}})};'
              : 'export const LocalNotifications={addListener:async()=>({remove:async()=>{}}),schedule:async()=>{},cancel:async()=>{},checkPermissions:async()=>({display:"granted"})};',
            loader: "js",
          })
        );
      },
    },
  ],
});
const { AndroidClient, LocalStorageBackend } = await import(fixture);
let releaseTheme, announceTheme, announceFalse;
const themeGate = new Promise((resolve) => {
  releaseTheme = resolve;
});
const themeBlocked = new Promise((resolve) => {
  announceTheme = resolve;
});
const falsePersisted = new Promise((resolve) => {
  announceFalse = resolve;
});
let block = true;
const values = new Map([
  ["review:theme", JSON.stringify("system")],
  ["review:autoSync", JSON.stringify(true)],
]);
const preferences = {
  get: async ({ key }) => {
    const value = values.get(key) ?? null;
    if (key === "review:theme" && block) {
      block = false;
      announceTheme();
      await themeGate;
    }
    return { value };
  },
  set: async ({ key, value }) => {
    values.set(key, value);
    if (key === "review:autoSync" && value === "false") announceFalse();
  },
  remove: async ({ key }) => {
    values.delete(key);
  },
};
const client = new AndroidClient(
  new LocalStorageBackend("review:", preferences)
);
const publications = [];
const unsubscribe = client.onSettingsUpdate((snapshot) =>
  publications.push(snapshot)
);
const report = {
  actualNativeHost: false,
  seam: "actual AndroidClient public getSettings/setTheme/setAutoSync/refreshAutoSync + actual LocalStorageBackend",
  startedRuntime: false,
  overlappedAppearanceOperation: themeWrite ? "setTheme" : "getSettings",
  clipboard: "inert external boundary",
};
try {
  const appearance = themeWrite
    ? client.setTheme("dark")
    : client.getSettings();
  await themeBlocked;
  const explicit = client.setAutoSync(false);
  await Promise.race([
    falsePersisted,
    new Promise((resolve) => setTimeout(resolve, 30)),
  ]);
  releaseTheme();
  const [appearanceResult, autoSyncResult] = await Promise.all([
    appearance,
    explicit,
  ]);
  const state = await client.getState();
  const settings = await client.getSettings();
  report.appearanceResult = appearanceResult;
  report.autoSyncResult = autoSyncResult;
  report.runtimeAutoSync = state.autoSync;
  report.latestSettings = settings;
  report.publications = publications;
  assert.equal(
    state.autoSync,
    false,
    "Appearance must not restore stale Auto Sync after its explicit successful write"
  );
  assert.equal(
    autoSyncResult.autoSync,
    false,
    "Auto Sync action result must retain applied false"
  );
  assert.equal(autoSyncResult.status, "applied");
  assert.equal(
    settings.snapshot.state.autoSync,
    false,
    "current settings and runtime agree"
  );
  await client.setTheme("dark");
  await client.refreshAutoSync();
  assert.equal(
    (await client.getState()).autoSync,
    false,
    "theme mutation and refresh keep explicit Auto Sync"
  );
  assert.equal((await client.getSettings()).snapshot.state.theme, "dark");
  assert.equal(
    publications.at(-1).state.autoSync,
    false,
    "latest ordered feed agrees with applied Auto Sync"
  );
  const reopened = new AndroidClient(
    new LocalStorageBackend("review:", preferences)
  );
  assert.equal((await reopened.getSettings()).snapshot.state.autoSync, false);
  assert.equal((await reopened.getSettings()).snapshot.state.theme, "dark");
  report.pass = true;
} finally {
  releaseTheme();
  unsubscribe();
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  await rm(own, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    pass: report.pass,
    runtimeAutoSync: report.runtimeAutoSync,
    actualNativeHost: false,
  })
);
