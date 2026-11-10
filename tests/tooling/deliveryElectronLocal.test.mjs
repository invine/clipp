import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { installElectronLocal as installAdapter } from "../../scripts/delivery/electron-local.mjs";
import { acquireOwnership } from "../../scripts/delivery/ownership.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const ownedProfiles = new WeakMap();
const installedChecks = new Set([
  "electron-installed-native-webrtc",
  "electron-installed-launch-quit",
]);

async function installElectronLocal(options) {
  try {
    return await installAdapter({
      ...options,
      execute: async (...args) => {
        const result = await options.execute(...args);
        const checkId = args.at(-1);
        if (installedChecks.has(checkId)) {
          const log = `logs/${checkId}-${options.run.stages.electronLocal.attempts.length}.log`;
          const content =
            checkId === "electron-installed-launch-quit"
              ? JSON.stringify({
                  result: "installed-launch-normal-quit-passed",
                  executable: args[1][1],
                  profile: args[1][3],
                  pid: 1234,
                })
              : `passed ${checkId}`;
          writeFileSync(path.join(options.plan.outputRoot, log), content);
          options.run.stages.electronLocal.attempts.push({
            checkId,
            log,
            command: [args[0], ...args[1]],
            state: "passed",
            passed: true,
            logSha256: digest(content),
          });
        }
        return result;
      },
    });
  } finally {
    const profile = options.run.stages.electronLocal.installedProbe?.profile;
    if (profile) ownedProfiles.get(options.run)?.add(profile);
  }
}

function fixture(t) {
  const base = realpathSync(
    mkdtempSync(path.join(tmpdir(), "clipp-electron-local-"))
  );
  const profiles = new Set();
  t.after(() => {
    for (const profile of profiles)
      rmSync(profile, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  });
  const runRoot = path.join(base, "runs", "run-1");
  const app = path.join(runRoot, "package", "Clipp.app");
  mkdirSync(path.join(app, "Contents", "Resources"), { recursive: true });
  mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true });
  writeFileSync(path.join(app, "Contents", "Resources", "app.asar"), "asar");
  symlinkSync(
    "app.asar",
    path.join(app, "Contents", "Resources", "current.asar")
  );
  writeFileSync(path.join(app, "Contents", "MacOS", "Clipp"), "binary", {
    mode: 0o755,
  });
  writeFileSync(path.join(runRoot, "package", "Clipp.dmg"), "dmg");
  const contents = {
    "Contents/MacOS/Clipp": {
      size: 6,
      sha256: digest("binary"),
      executable: true,
    },
    "Contents/Resources/app.asar": {
      size: 4,
      sha256: digest("asar"),
      executable: false,
    },
    "Contents/Resources/current.asar": { link: "app.asar" },
  };
  const receipt = {
    schema: 1,
    source: "a".repeat(40),
    buildIdentity: "b".repeat(64),
    arch: process.arch,
    dmg: {
      kind: "dmg",
      path: "package/Clipp.dmg",
      size: 3,
      sha256: digest("dmg"),
    },
    asar: {
      kind: "asar",
      path: "package/Clipp.app/Contents/Resources/app.asar",
      size: 4,
      sha256: digest("asar"),
    },
    app: {
      kind: "app",
      path: "package/Clipp.app",
      sha256: digest(JSON.stringify(contents)),
    },
  };
  const destination = path.join(base, "Applications", "Clipp.app");
  const checkout = path.join(base, "checkout");
  mkdirSync(checkout);
  const repository = path.join(base, "repository");
  mkdirSync(repository);
  const packageChecks = [
    "electron-package-input",
    "electron-native-provision",
    "electron-builder-version",
    "electron-dmg-package",
    "electron-asar-list",
    "electron-signing-state",
    "electron-dmg-integrity",
    "electron-native-webrtc",
    "electron-quit",
  ];
  mkdirSync(path.join(runRoot, "logs"));
  const attempts = packageChecks.map((checkId) => {
    const log = `logs/${checkId}.log`;
    const content = `passed ${checkId}`;
    writeFileSync(path.join(runRoot, log), content);
    return { checkId, log, passed: true, logSha256: digest(content) };
  });
  const run = {
    checkout,
    source: { commit: receipt.source },
    targets: { "electron-local": { state: "pending" } },
    electronPackage: { state: "complete", receipt },
    stages: {
      electronPackage: { state: "passed", attempts },
      electronLocal: { state: "pending", attempts: [] },
    },
  };
  ownedProfiles.set(run, profiles);
  const plan = {
    outputRoot: runRoot,
    repository: { root: repository },
    privateReferences: {},
    targets: { "electron-local": { destinationIdentity: destination } },
  };
  return { base, runRoot, app, destination, run, plan, receipt };
}

function authorize(f, changes = {}) {
  const file = path.join(f.base, "authorization.json");
  writeFileSync(
    file,
    JSON.stringify({
      schema: 1,
      scope: "local-electron-installation",
      sourceRevision: f.receipt.source,
      buildIdentity: f.receipt.buildIdentity,
      destination: f.destination,
      authorizedBy: "fixture ticket-07 owned app",
      authorizedAt: "2026-11-10T00:00:00.000Z",
      ...changes,
    })
  );
  f.plan.privateReferences.electronAuthorizationRef = `file:${file}`;
}

function fakeRuntime(f) {
  const electron = path.join(f.run.checkout, "node_modules", "electron");
  mkdirSync(electron, { recursive: true });
  writeFileSync(
    path.join(electron, "index.js"),
    `module.exports = ${JSON.stringify(process.execPath)};`
  );
  writeFileSync(
    path.join(electron, "package.json"),
    JSON.stringify({ name: "electron", main: "index.js" })
  );
  mkdirSync(path.join(f.run.checkout, "apps", "electron"), { recursive: true });
  writeFileSync(
    path.join(f.run.checkout, "apps", "electron", "package.json"),
    JSON.stringify({ name: "clipp-electron" })
  );
  mkdirSync(path.join(f.run.checkout, "tests", "harness"), { recursive: true });
  writeFileSync(
    path.join(
      f.run.checkout,
      "tests",
      "harness",
      "electron-installed-quit.mjs"
    ),
    "// test harness"
  );
}

test("Electron local requires matching authorization before replacing an app", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  const commands = [];
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    execute: async (...args) => commands.push(args),
    save() {},
  });
  assert.equal(f.run.targets["electron-local"].state, "blocked");
  assert.match(f.run.targets["electron-local"].nextAction, /authorization/i);
  assert.equal(
    readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
  assert.equal(commands.length, 0);
  assert.equal(existsSync(path.join(f.base, ".clipp-delivery-backups")), false);
});

test("authorization bound to another build cannot replace the selected app", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f, { buildIdentity: "c".repeat(64) });
  fakeRuntime(f);
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  assert.equal(f.run.targets["electron-local"].state, "blocked");
  assert.equal(
    readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
});

test("changed package verification evidence blocks installation", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  writeFileSync(path.join(f.runRoot, "logs", "electron-quit.log"), "tampered");
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {},
      }),
    /package check electron-quit/
  );
  assert.equal(
    readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
});

test("Electron local retains the old bundle and confirms the installed candidate", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  const commands = [];
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    execute: async (bin, args, cwd, env, timeout, id) => {
      commands.push({ bin, args, id });
    },
    save() {},
    processes: () => [],
  });
  assert.equal(f.run.targets["electron-local"].state, "complete");
  assert.equal(
    readFileSync(
      path.join(f.destination, "Contents", "Resources", "app.asar"),
      "utf8"
    ),
    "asar"
  );
  const backup = f.run.stages.electronLocal.replacement.backup;
  assert.equal(
    readFileSync(path.join(backup, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
  assert.deepEqual(
    commands.map((command) => command.id),
    ["electron-installed-native-webrtc", "electron-installed-launch-quit"]
  );
  assert.equal(
    commands[1].args[1],
    path.join(f.destination, "Contents", "MacOS", "Clipp")
  );
  assert.equal(
    commands[1].args[2],
    path.join(f.destination, "Contents", "Resources", "app.asar")
  );
  assert.equal(
    commands[1].args[3],
    f.run.targets["electron-local"].installed.profile
  );
  assert.equal(
    f.run.targets["electron-local"].installed.executable,
    commands[1].args[1]
  );
  const saved = commands.length;
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    execute: async () => {
      throw new Error("replay executed");
    },
    save() {},
    processes: () => [],
  });
  assert.equal(commands.length, saved);
});

test("tampered installed launch evidence invalidates completed replay", async (t) => {
  const f = fixture(t);
  mkdirSync(path.dirname(f.destination), { recursive: true });
  authorize(f);
  fakeRuntime(f);
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  const quit = f.run.stages.electronLocal.attempts.findLast(
    (item) => item.checkId === "electron-installed-launch-quit"
  );
  writeFileSync(path.join(f.runRoot, quit.log), "tampered");
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {
          throw new Error("unexpected replay");
        },
      }),
    /installed check electron-installed-launch-quit/
  );
});

test("installed Quit evidence must state the observed executable and profile", async (t) => {
  const f = fixture(t);
  mkdirSync(path.dirname(f.destination), { recursive: true });
  authorize(f);
  fakeRuntime(f);
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  const quit = f.run.stages.electronLocal.attempts.findLast(
    (item) => item.checkId === "electron-installed-launch-quit"
  );
  writeFileSync(
    path.join(f.runRoot, quit.log),
    "passed without installed observation"
  );
  quit.logSha256 = digest("passed without installed observation");
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {
          throw new Error("unexpected replay");
        },
      }),
    /installed Quit observation/
  );
});

test("missing installed WebRTC evidence invalidates completed replay", async (t) => {
  const f = fixture(t);
  mkdirSync(path.dirname(f.destination), { recursive: true });
  authorize(f);
  fakeRuntime(f);
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  const native = f.run.stages.electronLocal.attempts.findLast(
    (item) => item.checkId === "electron-installed-native-webrtc"
  );
  rmSync(path.join(f.runRoot, native.log));
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {
          throw new Error("unexpected replay");
        },
      }),
    /installed check electron-installed-native-webrtc/
  );
});

test("completed receipt cannot redirect launch evidence to another executable", async (t) => {
  const f = fixture(t);
  mkdirSync(path.dirname(f.destination), { recursive: true });
  authorize(f);
  fakeRuntime(f);
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  f.run.targets["electron-local"].installed.executable = path.join(
    f.base,
    "other",
    "Clipp"
  );
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {
          throw new Error("unexpected replay");
        },
      }),
    /receipt identity is incompatible/
  );
});

test("repository-contained destination is rejected despite matching authorization", async (t) => {
  const f = fixture(t);
  f.destination = path.join(
    f.plan.repository.root,
    "Applications",
    "Clipp.app"
  );
  f.plan.targets["electron-local"].destinationIdentity = f.destination;
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(
    path.join(f.destination, "Contents", "keep.txt"),
    "caller source"
  );
  authorize(f);
  fakeRuntime(f);
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {},
      }),
    /outside selected repository/
  );
  assert.equal(
    readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
    "caller source"
  );
});

test("repository alias cannot hide a selected app destination", async (t) => {
  const f = fixture(t);
  const alias = path.join(f.base, "repository-alias");
  symlinkSync(f.plan.repository.root, alias, "dir");
  f.destination = path.join(alias, "Clipp.app");
  f.plan.targets["electron-local"].destinationIdentity = f.destination;
  mkdirSync(path.join(f.plan.repository.root, "Clipp.app", "Contents"), {
    recursive: true,
  });
  writeFileSync(
    path.join(f.plan.repository.root, "Clipp.app", "Contents", "keep.txt"),
    "caller source"
  );
  authorize(f);
  fakeRuntime(f);
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {},
      }),
    /outside selected repository/
  );
  assert.equal(
    readFileSync(
      path.join(f.plan.repository.root, "Clipp.app", "Contents", "keep.txt"),
      "utf8"
    ),
    "caller source"
  );
});

test("missing installed Quit runtime blocks before replacement", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {},
      }),
    /Installed Quit harness/
  );
  assert.equal(
    readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
  assert.equal(f.run.stages.electronLocal.replacement, undefined);
});

test("unavailable selected-app process observation blocks before replacement", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => {
          throw new Error("process observation unavailable");
        },
        execute: async () => {},
      }),
    /process observation unavailable/
  );
  assert.equal(
    readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
  assert.equal(f.run.stages.electronLocal.replacement, undefined);
});

test("failed installed Quit remains incomplete and resumes without replacing the app again", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async (_bin, _args, _cwd, _env, _timeout, id) => {
          if (id === "electron-installed-launch-quit")
            throw new Error("normal Quit failed");
        },
      }),
    /normal Quit failed/
  );
  assert.notEqual(f.run.targets["electron-local"].state, "complete");
  const backup = f.run.stages.electronLocal.replacement.backup;
  assert.equal(
    readFileSync(path.join(backup, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  assert.equal(f.run.targets["electron-local"].state, "complete");
  assert.equal(f.run.stages.electronLocal.replacement.backup, backup);
  assert.equal(f.run.stages.electronLocal.replacement.reconciled, true);
});

test("changed installed content invalidates completed replay", async (t) => {
  const f = fixture(t);
  mkdirSync(path.dirname(f.destination), { recursive: true });
  authorize(f);
  fakeRuntime(f);
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  writeFileSync(
    path.join(f.destination, "Contents", "Resources", "app.asar"),
    "changed"
  );
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {
          throw new Error("unexpected runtime");
        },
      }),
    /Installed app differs/
  );
  assert.equal(f.run.stages.electronLocal.replacement.backup, null);
});

test("completed replay requires the retained prior bundle", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  await installElectronLocal({
    plan: f.plan,
    run: f.run,
    save() {},
    processes: () => [],
    execute: async () => {},
  });
  rmSync(f.run.stages.electronLocal.replacement.backup, { recursive: true });
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {},
      }),
    /Retained previous app is missing/
  );
});

test("installed content changed during launch cannot complete", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async (_bin, _args, _cwd, _env, _timeout, id) => {
          if (id === "electron-installed-launch-quit")
            writeFileSync(
              path.join(f.destination, "Contents", "Resources", "app.asar"),
              "changed"
            );
        },
      }),
    /Installed app changed/
  );
  assert.notEqual(f.run.targets["electron-local"].state, "complete");
  assert.equal(
    readFileSync(
      path.join(
        f.run.stages.electronLocal.replacement.backup,
        "Contents",
        "keep.txt"
      ),
      "utf8"
    ),
    "old app"
  );
});

test("failed installed native launch cannot complete", async (t) => {
  const f = fixture(t);
  mkdirSync(path.dirname(f.destination), { recursive: true });
  authorize(f);
  fakeRuntime(f);
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async (_bin, _args, _cwd, _env, _timeout, id) => {
          if (id === "electron-installed-native-webrtc")
            throw new Error("installed native launch failed");
        },
      }),
    /installed native launch failed/
  );
  assert.notEqual(f.run.targets["electron-local"].state, "complete");
});

test("interrupted replacement with a mismatched destination blocks without losing recovery", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  f.run.stages.electronLocal.replacement = {
    startedAt: new Date().toISOString(),
    destination: f.destination,
    backup: path.join(f.base, "recovery", "Old.app"),
    confirmed: false,
  };
  mkdirSync(path.join(f.base, "recovery", "Old.app", "Contents"), {
    recursive: true,
  });
  writeFileSync(
    path.join(f.base, "recovery", "Old.app", "Contents", "keep.txt"),
    "recoverable"
  );
  await assert.rejects(
    () =>
      installElectronLocal({
        plan: f.plan,
        run: f.run,
        save() {},
        processes: () => [],
        execute: async () => {},
      }),
    /uncertain/i
  );
  assert.equal(
    readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
    "old app"
  );
  assert.equal(
    readFileSync(
      path.join(
        f.run.stages.electronLocal.replacement.backup,
        "Contents",
        "keep.txt"
      ),
      "utf8"
    ),
    "recoverable"
  );
});

test("another run owning the same app path prevents replacement", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "Contents"), { recursive: true });
  writeFileSync(path.join(f.destination, "Contents", "keep.txt"), "old app");
  authorize(f);
  fakeRuntime(f);
  const release = acquireOwnership(
    `electron-app:${realpathSync(f.destination)}`
  );
  try {
    await assert.rejects(
      () =>
        installElectronLocal({
          plan: f.plan,
          run: f.run,
          save() {},
          processes: () => [],
          execute: async () => {},
        }),
      /resource_owned/
    );
    assert.equal(
      readFileSync(path.join(f.destination, "Contents", "keep.txt"), "utf8"),
      "old app"
    );
  } finally {
    release();
  }
});
