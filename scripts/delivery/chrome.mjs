import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { acquireOwnership } from "./ownership.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const invalid = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
function canonicalPath(value) {
  let existing = path.resolve(value || "");
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  return path.resolve(
    realpathSync(existing),
    path.relative(existing, path.resolve(value || ""))
  );
}

export function chromeInventory(root) {
  const files = {};
  let count = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      const file = path.join(directory, entry);
      const relative = path.relative(root, file).split(path.sep).join("/");
      const stat = lstatSync(file);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        if (++count > 10_000 || stat.size > 100 * 1024 * 1024)
          invalid("chrome_artifact_invalid", "Chrome artifact limit exceeded");
        files[relative] = { size: stat.size, sha256: sha(readFileSync(file)) };
      } else
        invalid(
          "chrome_artifact_invalid",
          "Chrome artifact contains a symlink or unsupported entry"
        );
    }
  };
  if (!existsSync(root) || !lstatSync(root).isDirectory())
    invalid("chrome_artifact_missing", "Chrome production output is missing");
  walk(root);
  return files;
}

function requiredFile(inventory, name) {
  if (
    !name ||
    path.isAbsolute(name) ||
    name.split("/").includes("..") ||
    !inventory[name]
  )
    invalid(
      "chrome_artifact_missing",
      `Chrome production output is missing ${name || "a declared asset"}`
    );
}

export function inspectChromeBuild(root) {
  const inventory = chromeInventory(root);
  requiredFile(inventory, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(path.join(root, "manifest.json"), "utf8")
    );
  } catch {
    invalid("chrome_artifact_invalid", "Chrome production manifest is invalid");
  }
  if (
    manifest.manifest_version !== 3 ||
    !manifest.background?.service_worker ||
    !manifest.action?.default_popup
  )
    invalid(
      "chrome_artifact_invalid",
      "Chrome production manifest is incomplete"
    );
  for (const name of [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    "offscreen.html",
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {}),
  ])
    if (name) requiredFile(inventory, name);
  for (const content of manifest.content_scripts || [])
    for (const name of [...(content.js || []), ...(content.css || [])])
      requiredFile(inventory, name);
  for (const rule of manifest.web_accessible_resources || [])
    for (const name of rule.resources || []) requiredFile(inventory, name);
  for (const htmlFile of [
    "offscreen.html",
    manifest.action.default_popup,
    manifest.options_page,
  ].filter(Boolean)) {
    const html = readFileSync(path.join(root, htmlFile), "utf8");
    const assets = [
      ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
      ...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi),
    ].map((match) => match[1]);
    if (
      ["offscreen.html", manifest.action.default_popup].includes(htmlFile) &&
      !assets.some((name) => /\.js(?:$|\?)/.test(name))
    )
      invalid(
        "chrome_artifact_missing",
        `Chrome ${htmlFile} script is missing`
      );
    for (const asset of assets) {
      if (/^(?:https?:|data:|chrome-extension:)/i.test(asset))
        invalid("chrome_artifact_invalid", `External asset in ${htmlFile}`);
      const resolved = asset.startsWith("/")
        ? asset.slice(1)
        : path.posix.normalize(
            path.posix.join(path.posix.dirname(htmlFile), asset)
          );
      requiredFile(inventory, resolved.split("?")[0]);
    }
  }
  return { manifest, inventory, sha256: sha(JSON.stringify(inventory)) };
}

function copyInventory(source, destination, inventory) {
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const relative of Object.keys(inventory)) {
    const target = path.join(destination, relative);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    copyFileSync(path.join(source, relative), target);
  }
}

export function replaceChromeDestination({
  source,
  destination,
  expected,
  backupRoot,
}) {
  const physicalDestination = path.resolve(destination);
  const parent = path.dirname(physicalDestination);
  mkdirSync(parent, { recursive: true });
  const stage = path.join(parent, `.clipp-stage-${randomUUID()}`);
  copyInventory(source, stage, expected);
  if (JSON.stringify(chromeInventory(stage)) !== JSON.stringify(expected)) {
    rmSync(stage, { recursive: true, force: true });
    invalid(
      "chrome_artifact_changed",
      "Staged Chrome directory differs from immutable artifact"
    );
  }
  let backup = null;
  if (existsSync(physicalDestination)) {
    if (!lstatSync(physicalDestination).isDirectory())
      invalid(
        "chrome_destination_invalid",
        "Chrome destination is not a directory"
      );
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    backup = path.join(backupRoot, `previous-${randomUUID()}`);
    renameSync(physicalDestination, backup);
  }
  try {
    renameSync(stage, physicalDestination);
  } catch (error) {
    if (backup) renameSync(backup, physicalDestination);
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  if (
    JSON.stringify(chromeInventory(physicalDestination)) !==
    JSON.stringify(expected)
  )
    invalid(
      "chrome_destination_changed",
      "Chrome destination inventory differs from candidate"
    );
  return { state: "replaced", destination: physicalDestination, backup };
}

export function verifyLoadedChrome(expected, observed) {
  if (
    canonicalPath(observed.profilePath) !== canonicalPath(expected.profilePath)
  )
    invalid(
      "chrome_loaded_profile_mismatch",
      "Selected Chrome profile was not observed"
    );
  if (
    canonicalPath(observed.extensionPath) !==
    canonicalPath(expected.extensionPath)
  )
    invalid(
      "chrome_loaded_path_mismatch",
      "Chrome loaded path differs from candidate destination"
    );
  if (observed.extensionId !== expected.extensionId)
    invalid(
      "chrome_loaded_id_mismatch",
      "Chrome extension ID differs from selected build"
    );
  if (observed.buildId !== expected.buildId)
    invalid(
      "chrome_loaded_build_mismatch",
      "Chrome loaded build identity differs from candidate"
    );
  if (observed.popupReady !== true)
    invalid("chrome_popup_unready", "Chrome popup did not reach readiness");
  return true;
}

export async function observeChrome({ plan, expected }) {
  const endpoint = reference(plan.privateReferences?.chromeDebugUrlRef);
  if (!endpoint) return null;
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(endpoint))
    invalid(
      "chrome_debug_endpoint_invalid",
      "Chrome debugging endpoint must be local"
    );
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  let versionPage;
  let popup;
  try {
    const context = browser.contexts()[0];
    if (!context)
      invalid(
        "chrome_profile_unavailable",
        "Selected Chrome profile has no browser context"
      );
    versionPage = await context.newPage();
    await versionPage.goto("chrome://version", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    const profilePath = (
      await versionPage.locator("#profile_path").textContent({ timeout: 5000 })
    )?.trim();
    const commandLine =
      (await versionPage
        .locator("#command_line")
        .textContent({ timeout: 5000 })) || "";
    if (canonicalPath(profilePath) !== canonicalPath(expected.profilePath))
      invalid(
        "chrome_loaded_profile_mismatch",
        "Chrome debugging endpoint is not the selected profile"
      );
    const loadedArguments = [
      ...commandLine.matchAll(/--load-extension=(?:"([^"]+)"|([^\s]+))/g),
    ].flatMap((match) => (match[1] || match[2]).split(","));
    if (
      !loadedArguments.some(
        (value) =>
          canonicalPath(value) === canonicalPath(expected.extensionPath)
      )
    )
      invalid(
        "chrome_loaded_path_mismatch",
        "Selected Chrome process does not report the stable extension path"
      );
    const workers = context
      .serviceWorkers()
      .filter((item) => item.url().startsWith("chrome-extension://"));
    if (!workers.length)
      workers.push(
        await context.waitForEvent("serviceworker", { timeout: 15_000 })
      );
    let observed = null;
    for (const worker of workers) {
      const extensionId = new URL(worker.url()).host;
      let candidatePage;
      try {
        candidatePage = await context.newPage();
        await candidatePage.goto(
          `chrome-extension://${extensionId}/src/popup.html`,
          { waitUntil: "domcontentloaded", timeout: 10_000 }
        );
        const marker = await candidatePage.evaluate(async () => {
          const response = await fetch("/delivery-build.json");
          return response.ok ? await response.json() : null;
        });
        if (marker?.buildId === expected.buildId) {
          observed = { extensionId, marker };
          popup = candidatePage;
          break;
        }
      } catch {
        /* another extension or unavailable popup is not this build */
      } finally {
        if (candidatePage !== popup) await candidatePage?.close();
      }
    }
    if (!observed?.marker || observed.marker.buildId !== expected.buildId)
      invalid(
        "chrome_loaded_build_mismatch",
        "Chrome is still running another extension build"
      );
    await popup.waitForFunction(
      () => {
        const root = document.querySelector("#root");
        return (
          Boolean(root?.textContent?.trim()) &&
          !root.textContent.includes("Loading History")
        );
      },
      null,
      { timeout: 15_000 }
    );
    return {
      profilePath,
      extensionPath: expected.extensionPath,
      extensionId: observed.extensionId,
      buildId: observed.marker.buildId,
      popupReady: true,
      observedAt: new Date().toISOString(),
    };
  } finally {
    await popup?.close();
    await versionPage?.close();
    await browser.close();
  }
}

function reference(value) {
  if (typeof value !== "string") return null;
  if (value.startsWith("env:")) return process.env[value.slice(4)] || null;
  if (value.startsWith("file:")) {
    try {
      return readFileSync(value.slice(5), "utf8").trim();
    } catch {
      return null;
    }
  }
  return null;
}

function authorize(ref, plan, destination, profilePath, buildId) {
  const raw = reference(ref);
  if (!raw) return null;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    record.schema !== 1 ||
    record.scope !== "local-chrome-extension" ||
    record.sourceRevision !== plan.source.commit ||
    path.resolve(record.destination || "") !== destination ||
    path.resolve(record.profilePath || "") !== profilePath ||
    (record.buildId && record.buildId !== buildId) ||
    typeof record.authorizedBy !== "string" ||
    !record.authorizedBy.trim()
  )
    return null;
  return {
    source: record.authorizedBy,
    scope: record.scope,
    sha256: sha(raw),
    observedAt: new Date().toISOString(),
  };
}

function confirmedInventory(root, expected, message) {
  if (JSON.stringify(chromeInventory(root)) !== JSON.stringify(expected))
    invalid("chrome_artifact_changed", message);
}

function validateHistoryTiming(file, frozen) {
  let results;
  try {
    results = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    invalid(
      "chrome_history_evidence_missing",
      "Populated History timing evidence is missing"
    );
  }
  if (!Array.isArray(results))
    invalid(
      "chrome_history_evidence_invalid",
      "Populated History timing evidence is invalid"
    );
  const populated = results.filter((row) => row.count === frozen.fixtureRows);
  for (const width of frozen.widths) {
    const count = populated.filter(
      (row) => row.surface === "popup" && row.width === width && !row.sourceName
    ).length;
    if (count < (width === 480 ? frozen.standardWidthRepetitions : 1))
      invalid(
        "chrome_history_evidence_incomplete",
        "Populated History width/repetition gate is incomplete"
      );
    if (
      !populated.some(
        (row) =>
          row.surface === "popup" &&
          row.width === width &&
          row.sourceName === frozen.longLabel
      )
    )
      invalid(
        "chrome_history_evidence_incomplete",
        "Long-label History gate is incomplete"
      );
  }
  if (
    !populated.some(
      (row) => row.surface === "options" && row.width === frozen.optionsWidth
    )
  )
    invalid(
      "chrome_history_evidence_incomplete",
      "Populated History options view is missing"
    );
  if (
    populated.some(
      (row) =>
        row.currentHistoryRows !== frozen.fixtureRows ||
        row.elapsedMs >= frozen.maxElapsedMs ||
        row.labelWidthReads > frozen.maxSynchronousLabelLayoutReads ||
        !Array.isArray(row.labels) ||
        row.labels.length !== frozen.fixtureRows ||
        row.labels.some(
          (label) =>
            !label.fullTitle ||
            !label.fits ||
            (label.visible &&
              (row.sourceName === frozen.longLabel
                ? label.display !== frozen.longLabel
                : !label.truncated))
        )
    )
  )
    invalid(
      "chrome_history_performance_failed",
      "Populated History timing or layout gate failed"
    );
  return sha(readFileSync(file));
}

/** Platform adapter consumed by the frozen delivery runner. */
export async function deliverChrome({ plan, run, execute, save, observe }) {
  const selected = "chrome-local";
  if (!run.targets[selected]) return;
  const target = plan.targets[selected];
  const stage = run.stages.chromeLocal;
  const frozen = plan.profile.chromeLocal;
  const dist = path.join(run.checkout, "apps/extension/dist");
  const original = inspectChromeBuild(dist);
  if (
    JSON.stringify(original.inventory) !==
    JSON.stringify(run.artifacts.extension)
  )
    invalid("candidate_artifact_changed", "Verified Chrome output changed");
  const destination = path.resolve(target.destinationIdentity || "");
  const profilePath = path.resolve(target.profilePath || "");
  if (
    !path.isAbsolute(target.destinationIdentity || "") ||
    !path.isAbsolute(target.profilePath || "")
  )
    invalid(
      "prerequisite_unavailable",
      "Chrome destination and profile paths must be absolute"
    );
  const destinationPhysical = canonicalPath(destination);
  const checkoutPhysical = canonicalPath(run.checkout);
  const profilePhysical = canonicalPath(profilePath);
  const inside = (child, parent) =>
    child === parent || child.startsWith(`${parent}${path.sep}`);
  if (inside(destinationPhysical, checkoutPhysical))
    invalid(
      "chrome_destination_invalid",
      "Chrome destination must be outside candidate checkout"
    );
  if (
    inside(profilePhysical, destinationPhysical) ||
    inside(destinationPhysical, profilePhysical)
  )
    invalid(
      "chrome_destination_invalid",
      "Chrome extension directory and selected profile must be separate"
    );
  if (existsSync(destination) && lstatSync(destination).isSymbolicLink())
    invalid(
      "chrome_destination_invalid",
      "Chrome destination cannot be a symlink"
    );
  const buildId = sha(
    JSON.stringify({
      source: plan.source.commit,
      profile: plan.profile.sha256,
      inventory: original.sha256,
    })
  );
  const artifactBase = path.join(plan.outputRoot, "chrome");
  if (!stage.artifact) {
    const artifactPath = path.join(artifactBase, `artifact-${randomUUID()}`);
    copyInventory(dist, artifactPath, original.inventory);
    const marker = {
      schema: 1,
      sourceRevision: plan.source.commit,
      buildId,
      baseInventorySha256: original.sha256,
    };
    writeFileSync(
      path.join(artifactPath, "delivery-build.json"),
      JSON.stringify(marker) + "\n",
      { flag: "wx", mode: 0o600 }
    );
    stage.artifact = {
      path: path.relative(plan.outputRoot, artifactPath),
      inventory: chromeInventory(artifactPath),
      buildId,
      sourceInventorySha256: original.sha256,
    };
    save();
  }
  if (
    stage.artifact.buildId !== buildId ||
    stage.artifact.sourceInventorySha256 !== original.sha256
  )
    invalid(
      "chrome_artifact_changed",
      "Chrome artifact identity differs from frozen candidate"
    );
  const artifactPath = path.resolve(plan.outputRoot, stage.artifact.path);
  if (!artifactPath.startsWith(`${artifactBase}${path.sep}`))
    invalid("chrome_artifact_changed", "Chrome artifact escaped run store");
  confirmedInventory(
    artifactPath,
    stage.artifact.inventory,
    "Immutable Chrome artifact changed"
  );
  if (run.targets[selected].state === "complete") {
    confirmedInventory(
      destination,
      stage.artifact.inventory,
      "Completed Chrome destination changed"
    );
    return;
  }
  if (!stage.checks) stage.checks = {};
  for (const check of frozen.checks) {
    const prior = stage.checks[check.id];
    if (prior?.passed) {
      const log = path.resolve(plan.outputRoot, prior.log || "");
      if (
        !log.startsWith(`${plan.outputRoot}${path.sep}`) ||
        !existsSync(log) ||
        sha(readFileSync(log)) !== prior.logSha256 ||
        prior.artifactSha256 !== sha(JSON.stringify(stage.artifact.inventory))
      )
        invalid(
          "chrome_evidence_changed",
          `Previous ${check.id} evidence changed`
        );
      if (check.id === "chrome-populated-history") {
        const timings = path.join(
          plan.outputRoot,
          "chrome",
          "history-timings",
          "timings.json"
        );
        if (
          prior.timingSha256 !==
          validateHistoryTiming(timings, frozen.historyPerformance)
        )
          invalid(
            "chrome_evidence_changed",
            "Populated History timing evidence changed"
          );
      }
      continue;
    }
    const args = [
      path.join(run.checkout, check.script),
      ...(check.artifact ? [artifactPath] : []),
    ];
    const environment = {
      CLIPP_EXTENSION_FIXTURE_TRANSPORT: "",
      ...(check.id === "chrome-populated-history"
        ? {
            CLIPP_POPUP_TIMING_OUTPUT: path.join(
              plan.outputRoot,
              "chrome",
              "history-timings"
            ),
            CLIPP_POPUP_TIMING_ROWS: String(
              frozen.historyPerformance.fixtureRows
            ),
            CLIPP_POPUP_TIMING_MAX_MS: String(
              frozen.historyPerformance.maxElapsedMs
            ),
          }
        : {}),
    };
    await execute(
      process.execPath,
      args,
      run.checkout,
      environment,
      check.timeoutMs,
      check.id
    );
    const attempt = run.stages.chromeLocal.attempts.at(-1);
    const timingSha256 =
      check.id === "chrome-populated-history"
        ? validateHistoryTiming(
            path.join(
              plan.outputRoot,
              "chrome",
              "history-timings",
              "timings.json"
            ),
            frozen.historyPerformance
          )
        : null;
    stage.checks[check.id] = {
      passed: true,
      observedAt: new Date().toISOString(),
      artifactSha256: sha(JSON.stringify(stage.artifact.inventory)),
      log: attempt?.log ?? null,
      logSha256: attempt?.logSha256 ?? null,
      timingSha256,
    };
    save();
  }
  const authorization = authorize(
    plan.privateReferences?.chromeAuthorizationRef,
    plan,
    destination,
    profilePath,
    buildId
  );
  if (!authorization) {
    run.targets[selected] = {
      state: "blocked",
      nextAction: "Matching local Chrome replacement authorization is required",
      updatedAt: new Date().toISOString(),
    };
    save();
    return;
  }
  stage.authorization = authorization;
  const releases = [];
  const canRecover = () =>
    Boolean(stage.replacement?.startedAt) &&
    existsSync(destination) &&
    JSON.stringify(chromeInventory(destination)) ===
      JSON.stringify(stage.artifact.inventory);
  try {
    for (const identity of [
      `chrome-destination:${destinationPhysical}`,
      `chrome-profile:${profilePhysical}`,
    ].sort())
      releases.push(acquireOwnership(identity, { canRecover }));
  } catch (error) {
    for (const release of releases.reverse()) release();
    throw error;
  }
  try {
    if (!stage.replacement?.confirmed) {
      if (
        existsSync(destination) &&
        JSON.stringify(chromeInventory(destination)) ===
          JSON.stringify(stage.artifact.inventory)
      ) {
        stage.replacement = {
          ...(stage.replacement || {}),
          confirmed: true,
          reconciled: true,
          observedAt: new Date().toISOString(),
        };
        save();
      } else {
        if (stage.replacement?.startedAt)
          invalid(
            "chrome_destination_uncertain",
            "Previous Chrome replacement is uncertain; inspect destination and backup before retry"
          );
        stage.replacement = {
          startedAt: new Date().toISOString(),
          confirmed: false,
        };
        save();
        const replacement = replaceChromeDestination({
          source: artifactPath,
          destination,
          expected: stage.artifact.inventory,
          backupRoot: path.join(
            path.dirname(destination),
            ".clipp-delivery-backups"
          ),
        });
        stage.replacement = {
          ...stage.replacement,
          ...replacement,
          confirmed: true,
          observedAt: new Date().toISOString(),
        };
        save();
      }
    } else
      confirmedInventory(
        destination,
        stage.artifact.inventory,
        "Chrome destination changed after replacement"
      );
    const expected = {
      profilePath,
      extensionPath: destination,
      extensionId: target.extensionId || null,
      buildId,
    };
    let observation = null;
    try {
      observation = await observe({ plan, run, expected, artifactPath });
    } catch (error) {
      stage.observationError = error.message;
      save();
    }
    if (!observation) {
      run.targets[selected] = {
        state: "blocked",
        nextAction:
          "Load or reload the stable extension in the selected Chrome profile, then provide a CDP observation",
        updatedAt: new Date().toISOString(),
      };
      save();
      return;
    }
    if (!expected.extensionId) expected.extensionId = observation.extensionId;
    verifyLoadedChrome(expected, observation);
    stage.loaded = observation;
    run.targets[selected] = {
      state: "complete",
      nextAction: null,
      buildId,
      destination,
      profilePath,
      extensionId: observation.extensionId,
      updatedAt: new Date().toISOString(),
    };
    save();
  } finally {
    for (const release of releases.reverse()) release();
  }
}
