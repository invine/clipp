import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

const sha = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const reject = (code, message = code) => {
  throw Object.assign(new Error(message), { code });
};

function privateValue(reference) {
  if (typeof reference !== "string") return null;
  if (reference.startsWith("env:"))
    return process.env[reference.slice(4)] || null;
  if (reference.startsWith("file:")) {
    try {
      return readFileSync(reference.slice(5), "utf8").trim();
    } catch {
      return null;
    }
  }
  if (reference.startsWith("keychain:") && process.platform === "darwin") {
    const result = spawnSync(
      "security",
      ["find-generic-password", "-w", "-s", reference.slice(9)],
      {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      }
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }
  return null;
}

function signing(plan, mode) {
  if (mode === "unsigned-artifact" || mode === "debug")
    return { mode, environment: {} };
  const raw = privateValue(plan.privateReferences?.androidSigningRef);
  let identity;
  try {
    identity = JSON.parse(raw);
  } catch {
    /* missing private identity */
  }
  if (
    !identity?.keystorePath ||
    !path.isAbsolute(identity.keystorePath) ||
    !existsSync(identity.keystorePath) ||
    !identity.keyAlias ||
    !identity.storePassword ||
    !identity.keyPassword ||
    !/^[a-fA-F0-9]{64}$/.test(identity.certificateSha256 || "")
  )
    reject(
      "prerequisite_unavailable",
      "Configured Android upload signing identity is unavailable"
    );
  return {
    mode,
    expectedCertificate: identity.certificateSha256.toLowerCase(),
    environment: {
      CLIPP_ANDROID_UPLOAD_KEYSTORE: identity.keystorePath,
      CLIPP_ANDROID_UPLOAD_ALIAS: identity.keyAlias,
      CLIPP_ANDROID_UPLOAD_STORE_PASSWORD: identity.storePassword,
      CLIPP_ANDROID_UPLOAD_KEY_PASSWORD: identity.keyPassword,
    },
  };
}

function webFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return webFiles(root, file);
      if (!entry.isFile())
        reject(
          "android_artifact_invalid",
          "Android web output contains a non-file entry"
        );
      return [
        {
          relative: path.relative(root, file).split(path.sep).join("/"),
          sha256: sha(file),
        },
      ];
    });
}

function archive(file, kind, builtWeb) {
  const list = spawnSync("unzip", ["-Z", "-1", file], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (list.status !== 0)
    reject("android_artifact_invalid", `${kind} archive is invalid`);
  const entries = list.stdout.trim().split("\n");
  const prefix = kind === "aab" ? "base/assets/public/" : "assets/public/";
  const index = `${prefix}index.html`;
  const configPath =
    kind === "aab"
      ? "base/assets/capacitor.config.json"
      : "assets/capacitor.config.json";
  if (
    !entries.includes(index) ||
    !entries.includes(configPath) ||
    (kind === "aab" && !entries.includes("base/manifest/AndroidManifest.xml"))
  )
    reject(
      "android_artifact_invalid",
      `${kind} is missing bundled web assets or manifest`
    );
  const content = spawnSync("unzip", ["-p", file, index], {
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (content.status !== 0)
    reject("android_artifact_invalid", `${kind} web index is unreadable`);
  for (const webFile of builtWeb) {
    const archived = `${prefix}${webFile.relative}`;
    if (!entries.includes(archived))
      reject(
        "android_artifact_invalid",
        `${kind} is missing ${webFile.relative}`
      );
    const result = spawnSync("unzip", ["-p", file, archived], {
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (
      result.status !== 0 ||
      createHash("sha256").update(result.stdout).digest("hex") !==
        webFile.sha256
    )
      reject(
        "android_artifact_invalid",
        `${kind} web assets differ from verified candidate`
      );
  }
  const configResult = spawnSync("unzip", ["-p", file, configPath], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  let config;
  try {
    config = JSON.parse(configResult.stdout);
  } catch {
    reject(
      "android_artifact_invalid",
      `${kind} Capacitor configuration is invalid`
    );
  }
  if (configResult.status !== 0 || config.server?.url)
    reject(
      "android_artifact_invalid",
      `${kind} contains a development-server URL`
    );
  return {
    entries: entries.length,
    webFiles: builtWeb.length,
    indexSha256: builtWeb.find((entry) => entry.relative === "index.html")
      ?.sha256,
  };
}

function metadata(aapt2, apk, source) {
  const result = spawnSync(aapt2, ["dump", "badging", apk], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0)
    reject("android_manifest_invalid", "Cannot inspect APK manifest");
  const fields = {
    applicationId: /package:\s+name='([^']+)'/.exec(result.stdout)?.[1],
    versionCode: /versionCode='([^']+)'/.exec(result.stdout)?.[1],
    versionName: /versionName='([^']+)'/.exec(result.stdout)?.[1],
    minSdk: /(?:minSdkVersion|sdkVersion):'([^']+)'/.exec(result.stdout)?.[1],
    targetSdk: /targetSdkVersion:'([^']+)'/.exec(result.stdout)?.[1],
    compileSdk: /compileSdkVersion='([^']+)'/.exec(result.stdout)?.[1],
  };
  for (const [key, value] of Object.entries(fields))
    if (value !== source[key])
      reject(
        "android_manifest_invalid",
        `APK ${key} differs from committed product metadata`
      );
  return fields;
}

function sourceMetadata(checkout) {
  const gradle = readFileSync(
    path.join(checkout, "apps/android/android/app/build.gradle"),
    "utf8"
  );
  const vars = readFileSync(
    path.join(checkout, "apps/android/android/variables.gradle"),
    "utf8"
  );
  const find = (text, regex, field) => {
    const value = regex.exec(text)?.[1];
    if (!value)
      reject(
        "android_manifest_invalid",
        `Committed Android source lacks ${field}`
      );
    return value;
  };
  return {
    applicationId: find(
      gradle,
      /applicationId\s+["']([^"']+)["']/,
      "applicationId"
    ),
    versionCode: find(gradle, /versionCode\s+(\d+)/, "versionCode"),
    versionName: find(gradle, /versionName\s+["']([^"']+)["']/, "versionName"),
    minSdk: find(vars, /minSdkVersion\s*=\s*(\d+)/, "minSdkVersion"),
    targetSdk: find(vars, /targetSdkVersion\s*=\s*(\d+)/, "targetSdkVersion"),
    compileSdk: find(
      vars,
      /compileSdkVersion\s*=\s*(\d+)/,
      "compileSdkVersion"
    ),
  };
}

function bundleMetadata(log, source) {
  const output = readFileSync(log, "utf8");
  const fields = {
    applicationId: /<manifest\b[^>]*\bpackage="([^"]+)"/.exec(output)?.[1],
    versionCode: /<manifest\b[^>]*\bandroid:versionCode="([^"]+)"/.exec(
      output
    )?.[1],
    versionName: /<manifest\b[^>]*\bandroid:versionName="([^"]+)"/.exec(
      output
    )?.[1],
    minSdk: /<uses-sdk\b[^>]*\bandroid:minSdkVersion="([^"]+)"/.exec(
      output
    )?.[1],
    targetSdk: /<uses-sdk\b[^>]*\bandroid:targetSdkVersion="([^"]+)"/.exec(
      output
    )?.[1],
  };
  for (const [key, value] of Object.entries(fields))
    if (value !== source[key])
      reject(
        "android_manifest_invalid",
        `AAB ${key} differs from committed product metadata`
      );
  return fields;
}

function copy(source, destination, kind) {
  if (!existsSync(source) || !lstatSync(source).isFile())
    reject("android_artifact_missing", `Missing ${kind} build output`);
  copyFileSync(source, destination);
  return {
    kind,
    path: destination,
    size: lstatSync(destination).size,
    sha256: sha(destination),
  };
}

function cleanSource(checkout, commit) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: checkout,
    encoding: "utf8",
    timeout: 10_000,
  });
  const dirty = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: checkout, encoding: "utf8", timeout: 10_000 }
  );
  if (
    head.status !== 0 ||
    head.stdout.trim() !== commit ||
    dirty.status !== 0 ||
    dirty.stdout.trim()
  )
    reject(
      "candidate_source_mutated",
      "Android packaging changed committed candidate source"
    );
}

function signature(apksigner, keytool, apk, aab, identity) {
  const apkResult = spawnSync(apksigner, ["verify", "--print-certs", apk], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  const aabResult = aab
    ? spawnSync(keytool, ["-printcert", "-jarfile", aab], {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      })
    : null;
  if (identity.mode === "unsigned-artifact") {
    if (
      apkResult.status === 0 ||
      (aabResult &&
        !/Not a signed jar file/i.test(
          `${aabResult.stdout}\n${aabResult.stderr}`
        ))
    )
      reject(
        "android_signature_mismatch",
        "Unsigned artifact profile produced a signed output"
      );
    return { state: "unsigned-artifact", certificateSha256: null };
  }
  if (apkResult.status !== 0 || (aabResult && aabResult.status !== 0))
    reject(
      "android_signature_mismatch",
      "Android package signature is missing or invalid"
    );
  const apkHash = /certificate SHA-256 digest:\s*([a-f0-9:]{64,95})/i
    .exec(apkResult.stdout)?.[1]
    ?.replaceAll(":", "")
    .toLowerCase();
  const aabHash = aab
    ? /SHA256:\s*([a-f0-9:]{64,95})/i
        .exec(aabResult.stdout)?.[1]
        ?.replaceAll(":", "")
        .toLowerCase()
    : apkHash;
  if (
    !/^[a-f0-9]{64}$/.test(apkHash || "") ||
    apkHash !== aabHash ||
    (identity.expectedCertificate && apkHash !== identity.expectedCertificate)
  )
    reject(
      "android_signature_mismatch",
      "Android package certificate differs from declared signing identity"
    );
  return { state: identity.mode, certificateSha256: apkHash };
}

export async function packageAndroid({ plan, run, execute, save }) {
  const selected =
    plan.targets["android-package"] ||
    plan.targets["android-local"] ||
    plan.targets["android-internal"];
  if (!selected || run.androidQualification?.state !== "passed") return;
  const mode = selected.signing;
  if (!["upload", "unsigned-artifact", "debug"].includes(mode))
    reject("invalid_profile", "Unsupported Android signing mode");
  const stage = run.stages.androidPackage;
  if (stage.state === "passed") {
    if (
      stage.receipt?.source !== plan.source.commit ||
      stage.receipt?.signing !== mode ||
      stage.receipt?.qualification?.appSha256 !==
        run.androidQualification.pair?.appSha256 ||
      stage.receipt?.qualification?.testSha256 !==
        run.androidQualification.pair?.testSha256
    )
      reject(
        "android_artifact_changed",
        "Saved Android package identity changed"
      );
    for (const artifact of [stage.receipt.apk, stage.receipt.aab].filter(
      Boolean
    )) {
      const file = path.resolve(plan.outputRoot, artifact.path);
      if (
        !file.startsWith(`${plan.outputRoot}${path.sep}`) ||
        !existsSync(file) ||
        !lstatSync(file).isFile() ||
        !realpathSync(file).startsWith(
          `${realpathSync(plan.outputRoot)}${path.sep}`
        ) ||
        sha(file) !== artifact.sha256
      )
        reject(
          "android_artifact_changed",
          "Saved Android package changed; create a new candidate"
        );
    }
    return;
  }
  cleanSource(run.checkout, plan.source.commit);
  const identity = signing(plan, mode);
  const pair = run.androidQualification.pair;
  if (
    pair?.revision !== plan.source.commit ||
    !existsSync(pair.app) ||
    !existsSync(pair.test) ||
    sha(pair.app) !== pair.appSha256 ||
    sha(pair.test) !== pair.testSha256
  )
    reject(
      "native_evidence_changed",
      "Native qualification pair differs from selected source"
    );
  if (process.env.VITE_DEV_SERVER_URL)
    reject(
      "android_artifact_invalid",
      "Development-server URLs are unsupported in Android packages"
    );
  const web = path.join(run.checkout, "apps/android/dist/index.html");
  if (!existsSync(web))
    reject(
      "android_artifact_missing",
      "Verified Android web output is missing"
    );
  const builtWeb = webFiles(path.dirname(web));
  const webInventorySha256 = createHash("sha256")
    .update(JSON.stringify(builtWeb))
    .digest("hex");
  const sdk = privateValue(plan.privateReferences?.androidSdkRef);
  const java = privateValue(plan.privateReferences?.javaHomeRef);
  if (!sdk || !java || !path.isAbsolute(sdk) || !path.isAbsolute(java))
    reject(
      "prerequisite_unavailable",
      "Android SDK and JDK references are unavailable"
    );
  const environment = {
    JAVA_HOME: java,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    CLIPP_ANDROID_UPLOAD_KEYSTORE: undefined,
    CLIPP_ANDROID_UPLOAD_ALIAS: undefined,
    CLIPP_ANDROID_UPLOAD_STORE_PASSWORD: undefined,
    CLIPP_ANDROID_UPLOAD_KEY_PASSWORD: undefined,
    ...identity.environment,
  };
  if (mode === "debug") {
    await execute(
      "npm",
      ["--workspace", "apps/android", "run", "build:native:debug"],
      run.checkout,
      environment,
      plan.profile.androidPackage.gradleTimeoutMs,
      "android-debug-apk-build"
    );
  } else {
    await execute(
      "npm",
      ["--workspace", "apps/android", "run", "build:native:release"],
      run.checkout,
      environment,
      plan.profile.androidPackage.gradleTimeoutMs,
      "android-release-apk-build"
    );
    await execute(
      "npm",
      ["--workspace", "apps/android", "run", "build:native:bundle"],
      run.checkout,
      environment,
      plan.profile.androidPackage.gradleTimeoutMs,
      "android-release-aab-build"
    );
  }
  const output = path.join(
    run.checkout,
    "apps/android/android/app/build/outputs"
  );
  const directory = path.join(
    plan.outputRoot,
    "android-package",
    `stage-${randomUUID()}`
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const apkName =
    mode === "debug"
      ? "app-debug.apk"
      : mode === "upload"
        ? "app-release.apk"
        : "app-release-unsigned.apk";
  const apk = copy(
    path.join(output, "apk", mode === "debug" ? "debug" : "release", apkName),
    path.join(directory, apkName),
    "apk"
  );
  const aab =
    mode === "debug"
      ? null
      : copy(
          path.join(output, "bundle/release/app-release.aab"),
          path.join(directory, "app-release.aab"),
          "aab"
        );
  const committedVersion = sourceMetadata(run.checkout);
  const version = metadata(
    path.join(
      sdk,
      "build-tools",
      plan.profile.androidQualification.sdkBuildTools,
      "aapt2"
    ),
    apk.path,
    committedVersion
  );
  const bundleLog = aab
    ? await execute(
        "npm",
        [
          "--workspace",
          "apps/android",
          "run",
          "inspect:native:bundle-manifest",
        ],
        run.checkout,
        { ...environment, CLIPP_ANDROID_BUNDLE_PATH: aab.path },
        120_000,
        "android-bundle-manifest"
      )
    : null;
  const bundleManifest = aab
    ? bundleMetadata(bundleLog, committedVersion)
    : null;
  const inventories = {
    apk: archive(apk.path, "apk", builtWeb),
    aab: aab && archive(aab.path, "aab", builtWeb),
  };
  const signingResult = signature(
    path.join(
      sdk,
      "build-tools",
      plan.profile.androidQualification.sdkBuildTools,
      "apksigner"
    ),
    path.join(java, "bin", "keytool"),
    apk.path,
    aab?.path,
    identity
  );
  cleanSource(run.checkout, plan.source.commit);
  const buildIdentity = createHash("sha256")
    .update(
      JSON.stringify({
        source: plan.source.commit,
        tree: plan.source.tree,
        mode,
        profileSha256: plan.profile.sha256,
        configurationSha256: plan.configurationSha256,
        webInventorySha256,
        acceptance: [pair.appSha256, pair.testSha256],
        certificateSha256: signingResult.certificateSha256,
      })
    )
    .digest("hex");
  const receipt = {
    schema: 1,
    source: plan.source.commit,
    tree: plan.source.tree,
    configurationSha256: plan.configurationSha256,
    webInventorySha256,
    buildIdentity,
    buildMode: mode === "debug" ? "debug" : "release",
    qualification: {
      flavor: "acceptance",
      appSha256: pair.appSha256,
      testSha256: pair.testSha256,
    },
    productFlavor: "product",
    toolchain: {
      jdkMajor: plan.profile.androidQualification.jdkMajor,
      gradle: plan.profile.androidQualification.gradleVersion,
      sdkBuildTools: plan.profile.androidQualification.sdkBuildTools,
      bundletool: plan.profile.androidPackage.bundletoolVersion,
    },
    signing: mode,
    signature: signingResult,
    version,
    bundleManifest,
    inventories,
    apk: { ...apk, path: path.relative(plan.outputRoot, apk.path) },
    aab: aab && { ...aab, path: path.relative(plan.outputRoot, aab.path) },
    verifiedAt: new Date().toISOString(),
  };
  run.stages.androidPackage.receipt = receipt;
  run.stages.androidPackage.state = "passed";
  run.stages.androidPackage.updatedAt = new Date().toISOString();
  if (run.targets["android-package"])
    Object.assign(run.targets["android-package"], {
      state: "complete",
      nextAction: null,
    });
  if (run.targets["android-local"])
    run.targets["android-local"].nextAction =
      plan.targets["android-local"].signing === mode
        ? "install the verified compatible APK"
        : "prepare an APK with the declared local signing mode";
  if (run.targets["android-internal"])
    run.targets["android-internal"].nextAction =
      mode === "upload"
        ? "publish the verified signed AAB"
        : "prepare an upload-signed AAB before publication";
  save();
}
