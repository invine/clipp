/** Install a verified Electron package at one explicitly selected app path. */
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { acquireOwnership } from "./ownership.mjs";
import {
  electronAppIdentity,
  verifyElectronReceipt,
  packagedElectronExecutable,
} from "./electron.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const invalid = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const requiredPackageChecks = [
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

function verifyPackageChecks(stage, runRoot) {
  for (const id of requiredPackageChecks) {
    const attempt = stage.attempts?.findLast((item) => item.checkId === id);
    const log = path.resolve(runRoot, attempt?.log || "");
    if (
      !attempt?.passed ||
      !/^[0-9a-f]{64}$/.test(attempt.logSha256 || "") ||
      !log.startsWith(`${path.resolve(runRoot)}${path.sep}`) ||
      !existsSync(log) ||
      !lstatSync(log).isFile() ||
      sha(readFileSync(log)) !== attempt.logSha256
    )
      invalid(
        "electron_package_evidence_changed",
        `Electron package check ${id} is unavailable or changed`
      );
  }
}

function verifyInstalledChecks(
  stage,
  runRoot,
  checkout,
  executable,
  asar,
  profile
) {
  const commands = {
    "electron-installed-native-webrtc": [
      executable,
      path.join(checkout, "tests/harness/electron-packaged-webrtc.cjs"),
      asar,
    ],
    "electron-installed-launch-quit": [
      process.execPath,
      path.join(checkout, "tests/harness/electron-installed-quit.mjs"),
      executable,
      asar,
      profile,
    ],
  };
  for (const [id, command] of Object.entries(commands)) {
    const attempt = stage.attempts?.findLast((item) => item.checkId === id);
    const log = path.resolve(runRoot, attempt?.log || "");
    if (
      !attempt?.passed ||
      attempt.state !== "passed" ||
      JSON.stringify(attempt.command) !== JSON.stringify(command) ||
      !/^[0-9a-f]{64}$/.test(attempt.logSha256 || "") ||
      !log.startsWith(`${path.resolve(runRoot)}${path.sep}`) ||
      !existsSync(log) ||
      !lstatSync(log).isFile() ||
      sha(readFileSync(log)) !== attempt.logSha256
    )
      invalid(
        "electron_installed_evidence_changed",
        `Electron installed check ${id} is unavailable or changed`
      );
    if (id === "electron-installed-launch-quit") {
      const observation = readFileSync(log, "utf8")
        .split(/\r?\n/)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        })
        .findLast(
          (row) => row?.result === "installed-launch-normal-quit-passed"
        );
      if (
        observation?.executable !== executable ||
        observation?.profile !== profile ||
        !Number.isSafeInteger(observation?.pid) ||
        observation.pid <= 0
      )
        invalid(
          "electron_installed_evidence_changed",
          "Electron installed Quit observation is missing or mismatched"
        );
    }
  }
}

function canonicalPath(value) {
  let existing = path.resolve(value);
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing)
      invalid(
        "electron_destination_unavailable",
        "No existing ancestor for Electron installation"
      );
    existing = parent;
  }
  return path.resolve(
    realpathSync(existing),
    path.relative(existing, path.resolve(value))
  );
}

function privateReference(ref) {
  if (typeof ref !== "string") return null;
  if (ref.startsWith("env:")) return process.env[ref.slice(4)] || null;
  if (ref.startsWith("file:")) {
    try {
      return readFileSync(ref.slice(5), "utf8").trim();
    } catch {
      return null;
    }
  }
  if (ref.startsWith("keychain:")) {
    const result = spawnSync(
      "security",
      ["find-generic-password", "-w", "-s", ref.slice(9)],
      { encoding: "utf8", timeout: 10_000 }
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }
  return null;
}

function authorization(ref, source, buildIdentity, destination) {
  const raw = privateReference(ref);
  if (!raw) return null;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    record.schema !== 1 ||
    record.scope !== "local-electron-installation" ||
    record.sourceRevision !== source ||
    record.buildIdentity !== buildIdentity ||
    typeof record.destination !== "string" ||
    canonicalPath(record.destination) !== destination ||
    typeof record.authorizedBy !== "string" ||
    !record.authorizedBy.trim() ||
    typeof record.authorizedAt !== "string" ||
    Number.isNaN(Date.parse(record.authorizedAt))
  )
    return null;
  return {
    source: record.authorizedBy,
    authorizedAt: record.authorizedAt,
    scope: record.scope,
    sha256: sha(raw),
  };
}

function selectedAppProcesses(destination) {
  const result = spawnSync("ps", ["-axo", "pid=,comm="], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error)
    invalid(
      "electron_process_unavailable",
      "Cannot inspect selected Electron application processes"
    );
  const executable = path.join(destination, "Contents", "MacOS", "Clipp");
  return result.stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (!match) return [];
    let observed = path.resolve(match[2]);
    try {
      observed = realpathSync(observed);
    } catch {
      /* A process may have exited during observation. */
    }
    if (observed !== executable) return [];
    return [Number(match[1])];
  });
}

async function stopSelectedApp(destination, processes = selectedAppProcesses) {
  for (const pid of processes(destination)) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid)
      invalid("electron_process_unavailable", "Invalid selected app process");
    if (!processes(destination).includes(pid)) continue;
    process.kill(pid, "SIGTERM");
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") break;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    try {
      process.kill(pid, 0);
      invalid(
        "electron_process_running",
        "Selected Clipp process did not stop normally"
      );
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  if (processes(destination).length)
    invalid(
      "electron_process_running",
      "Selected Clipp process remains active"
    );
}

function installedMatches(destination, identity) {
  if (!existsSync(destination)) return false;
  if (!lstatSync(destination).isDirectory()) return false;
  try {
    return electronAppIdentity(destination) === identity;
  } catch {
    return false;
  }
}

export async function installElectronLocal({
  plan,
  run,
  execute,
  save,
  processes,
}) {
  const target = run.targets["electron-local"];
  if (!target) return;
  const stage = run.stages.electronLocal;
  const runRoot = plan.outputRoot;
  const receipt =
    run.targets["electron-package"]?.receipt ?? run.electronPackage?.receipt;
  if (!receipt || run.stages.electronPackage?.state !== "passed")
    invalid(
      "electron_package_unavailable",
      "A verified Electron package is required before installation"
    );
  verifyElectronReceipt(run, receipt, runRoot);
  verifyPackageChecks(run.stages.electronPackage, runRoot);
  const candidate = path.resolve(runRoot, receipt.app.path);
  const requested = plan.targets["electron-local"]?.destinationIdentity;
  if (
    !requested ||
    !path.isAbsolute(requested) ||
    path.basename(requested) !== "Clipp.app"
  )
    invalid(
      "electron_destination_unavailable",
      "Select an absolute Clipp.app installation path"
    );
  if (existsSync(requested) && lstatSync(requested).isSymbolicLink())
    invalid(
      "electron_destination_invalid",
      "Electron installation path cannot be a symbolic link"
    );
  const destination = canonicalPath(requested);
  const checkout = canonicalPath(run.checkout);
  const output = canonicalPath(runRoot);
  const repository = canonicalPath(plan.repository.root);
  const profileRoot = canonicalPath(tmpdir());
  if (
    destination === checkout ||
    destination.startsWith(`${checkout}${path.sep}`) ||
    destination === output ||
    destination.startsWith(`${output}${path.sep}`)
  )
    invalid(
      "electron_destination_invalid",
      "Electron installation must be outside candidate and run store"
    );
  if (
    destination === repository ||
    destination.startsWith(`${repository}${path.sep}`)
  )
    invalid(
      "electron_destination_invalid",
      "Electron installation must be outside selected repository"
    );
  if (
    profileRoot === repository ||
    profileRoot.startsWith(`${repository}${path.sep}`)
  )
    invalid(
      "electron_destination_invalid",
      "Installed Quit profile root must be outside selected repository"
    );
  const parent = path.dirname(destination);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory())
    invalid(
      "electron_destination_unavailable",
      "Electron installation parent is unavailable"
    );
  if (existsSync(destination) && !lstatSync(destination).isDirectory())
    invalid(
      "electron_destination_invalid",
      "Selected Electron application is not a bundle directory"
    );
  if (target.state === "complete") {
    if (!installedMatches(destination, receipt.app.sha256))
      invalid(
        "electron_installed_changed",
        "Installed app differs from the confirmed candidate"
      );
    const installedBinary = packagedElectronExecutable(destination);
    if (
      target.installed?.destination !== destination ||
      target.installed?.buildIdentity !== receipt.buildIdentity ||
      target.installed?.appSha256 !== receipt.app.sha256 ||
      target.installed?.executable !== installedBinary ||
      target.installed?.profile !== stage.installedProbe?.profile
    )
      invalid(
        "electron_installed_evidence_changed",
        "Installed Electron receipt identity is incompatible with selected app"
      );
    if (stage.replacement?.backup && !existsSync(stage.replacement.backup))
      invalid(
        "electron_replacement_uncertain",
        "Retained previous app is missing; inspect replacement recovery"
      );
    verifyInstalledChecks(
      stage,
      runRoot,
      run.checkout,
      installedBinary,
      path.join(destination, "Contents/Resources/app.asar"),
      target.installed.profile
    );
    return;
  }
  const auth = authorization(
    plan.privateReferences?.electronAuthorizationRef,
    run.source.commit,
    receipt.buildIdentity,
    destination
  );
  if (!auth) {
    Object.assign(target, {
      state: "blocked",
      nextAction:
        "Matching local Electron installation authorization is required",
      updatedAt: new Date().toISOString(),
    });
    save();
    return;
  }
  const installedQuitHarness = path.join(
    run.checkout,
    "tests/harness/electron-installed-quit.mjs"
  );
  if (!existsSync(installedQuitHarness))
    invalid(
      "electron_runtime_unavailable",
      "Installed Quit harness is unavailable"
    );
  stage.authorization = auth;
  save();
  const release = acquireOwnership(`electron-app:${destination}`, {
    canRecover: () =>
      !stage.replacement?.startedAt ||
      installedMatches(destination, receipt.app.sha256),
  });
  try {
    const replacement = stage.replacement;
    if (
      replacement?.startedAt &&
      !installedMatches(destination, receipt.app.sha256)
    )
      invalid(
        "electron_replacement_uncertain",
        "Previous app replacement is uncertain; inspect destination and retained backup"
      );
    if (replacement?.backup && !existsSync(replacement.backup))
      invalid(
        "electron_replacement_uncertain",
        "Retained previous app is missing; inspect replacement recovery"
      );
    if (!replacement?.startedAt) {
      (processes ?? selectedAppProcesses)(destination);
      const staged = path.join(parent, `.clipp-install-${randomUUID()}.app`);
      const backupRoot = path.join(parent, ".clipp-delivery-backups");
      mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
      const backup = existsSync(destination)
        ? path.join(backupRoot, `previous-${randomUUID()}.app`)
        : null;
      stage.replacement = {
        startedAt: new Date().toISOString(),
        destination,
        staged,
        backup,
        confirmed: false,
      };
      save();
      cpSync(candidate, staged, {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
      });
      if (!installedMatches(staged, receipt.app.sha256))
        invalid(
          "electron_copy_invalid",
          "Staged app differs from verified package"
        );
      await stopSelectedApp(destination, processes);
      if (backup) renameSync(destination, backup);
      renameSync(staged, destination);
      if (!installedMatches(destination, receipt.app.sha256))
        invalid(
          "electron_installed_changed",
          "Installed app differs from verified package"
        );
      if (backup && !existsSync(backup))
        invalid(
          "electron_replacement_uncertain",
          "Retained previous app is missing; inspect replacement recovery"
        );
      stage.replacement.confirmed = true;
      stage.replacement.confirmedAt = new Date().toISOString();
      save();
    } else {
      stage.replacement.reconciled = true;
      stage.replacement.confirmed = true;
      save();
    }
    const installedAsar = path.join(destination, "Contents/Resources/app.asar");
    const installedBinary = packagedElectronExecutable(destination);
    await execute(
      installedBinary,
      [
        path.join(run.checkout, "tests/harness/electron-packaged-webrtc.cjs"),
        installedAsar,
      ],
      run.checkout,
      { ELECTRON_RUN_AS_NODE: "1" },
      120_000,
      "electron-installed-native-webrtc"
    );
    const profile = realpathSync(
      mkdtempSync(path.join(profileRoot, "clipp-installed-quit-"))
    );
    if (
      profile === repository ||
      profile.startsWith(`${repository}${path.sep}`)
    ) {
      rmSync(profile, { recursive: true, force: true });
      invalid(
        "electron_destination_invalid",
        "Installed Quit profile must be outside selected repository"
      );
    }
    stage.installedProbe = {
      executable: installedBinary,
      profile,
      startedAt: new Date().toISOString(),
    };
    save();
    await execute(
      process.execPath,
      [installedQuitHarness, installedBinary, installedAsar, profile],
      run.checkout,
      {},
      120_000,
      "electron-installed-launch-quit"
    );
    verifyInstalledChecks(
      stage,
      runRoot,
      run.checkout,
      installedBinary,
      installedAsar,
      profile
    );
    if (!installedMatches(destination, receipt.app.sha256))
      invalid(
        "electron_installed_changed",
        "Installed app changed during launch/Quit verification"
      );
    Object.assign(target, {
      state: "complete",
      nextAction: null,
      installed: {
        destination,
        buildIdentity: receipt.buildIdentity,
        appSha256: receipt.app.sha256,
        executable: installedBinary,
        profile,
        confirmedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    });
    stage.state = "passed";
    stage.updatedAt = new Date().toISOString();
    save();
  } finally {
    release();
  }
}
