import { createHash, createSign } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { acquireOwnership } from "./ownership.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code, message = code) => {
  throw Object.assign(new Error(message), { code });
};
const now = () => new Date().toISOString();

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
      { encoding: "utf8", timeout: 10_000 }
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }
  return null;
}

function authorization(plan, receipt) {
  let grant;
  try {
    grant = JSON.parse(
      privateValue(plan.privateReferences?.playAuthorizationRef)
    );
  } catch {
    /* absent */
  }
  const app = plan.targets["android-internal"]?.destinationIdentity;
  const certificate = receipt.signature?.certificateSha256;
  let signing;
  try {
    signing = JSON.parse(
      privateValue(plan.privateReferences?.androidSigningRef)
    );
  } catch {
    /* absent */
  }
  if (signing?.certificateSha256?.toLowerCase() !== certificate)
    fail(
      "play_prerequisite_unavailable",
      "Configured upload certificate differs from verified AAB"
    );
  const validLanguage = (language) => {
    try {
      return Intl.getCanonicalLocales(language).length === 1;
    } catch {
      return false;
    }
  };
  if (
    !grant ||
    grant.applicationId !== app ||
    grant.track !== "internal" ||
    grant.sourceCommit !== plan.source.commit ||
    grant.aabSha256 !== receipt.aab?.sha256 ||
    Number(grant.versionCode) !== Number(receipt.version?.versionCode) ||
    grant.certificateSha256 !== certificate ||
    typeof grant.authorizedBy !== "string" ||
    !grant.authorizedBy.trim() ||
    !Number.isFinite(Date.parse(grant.authorizedAt)) ||
    !Array.isArray(grant.releaseNotes) ||
    !grant.releaseNotes.length ||
    new Set(grant.releaseNotes.map((note) => note?.language)).size !==
      grant.releaseNotes.length ||
    grant.releaseNotes.some(
      (note) =>
        !validLanguage(note?.language) ||
        typeof note.text !== "string" ||
        !note.text.trim()
    )
  )
    fail(
      "publication_unauthorized",
      "Matching private Play publication authorization and release notes are required"
    );
  return grant;
}

function candidate(plan, run) {
  const receipt = run.stages.androidPackage?.receipt;
  if (
    run.stages.androidPackage?.state !== "passed" ||
    run.stages.androidPackage?.integrityError ||
    run.androidQualification?.state !== "passed" ||
    receipt?.qualification?.appSha256 !==
      run.androidQualification?.pair?.appSha256 ||
    receipt?.qualification?.testSha256 !==
      run.androidQualification?.pair?.testSha256 ||
    receipt?.source !== plan.source.commit ||
    receipt.signing !== "upload" ||
    receipt.signature?.state !== "upload" ||
    !/^[a-f0-9]{64}$/.test(receipt.signature?.certificateSha256 || "") ||
    receipt.version?.applicationId !==
      plan.targets["android-internal"]?.destinationIdentity ||
    !Number.isSafeInteger(Number(receipt.version?.versionCode)) ||
    !receipt.aab?.path ||
    !/^[a-f0-9]{64}$/.test(receipt.aab.sha256 || "")
  )
    fail(
      "play_prerequisite_unavailable",
      "Verified upload-signed Android package and native qualification are required"
    );
  const aab = path.resolve(plan.outputRoot, receipt.aab.path);
  if (!aab.startsWith(`${path.resolve(plan.outputRoot)}${path.sep}`))
    fail("android_artifact_invalid");
  let bytes;
  try {
    if (
      !lstatSync(aab).isFile() ||
      !realpathSync(aab).startsWith(
        `${realpathSync(plan.outputRoot)}${path.sep}`
      )
    )
      fail("android_artifact_invalid");
    bytes = readFileSync(aab);
  } catch (error) {
    if (error.code === "android_artifact_invalid") throw error;
    fail("android_artifact_missing");
  }
  if (sha(bytes) !== receipt.aab.sha256)
    fail("android_artifact_invalid", "Recorded AAB changed after verification");
  if (plan.targets["android-internal"]?.track !== "internal")
    fail(
      "play_prerequisite_unavailable",
      "Only the Play internal track is supported"
    );
  return { receipt, bytes };
}

const sameRelease = (release, stage, version) =>
  release?.releaseName === stage.releaseName &&
  release?.releaseLifecycleState === "RELEASE_LIFECYCLE_STATE_PUBLISHED" &&
  (release.activeArtifacts || []).some(
    (artifact) => Number(artifact.versionCode) === Number(version)
  );
const sameBundle = (bundle, receipt) =>
  Number(bundle.versionCode) === Number(receipt.version.versionCode) &&
  String(bundle.sha256 || "").toLowerCase() === receipt.aab.sha256;
const sameDraft = (release, releaseName, version, notes) =>
  release?.name === releaseName &&
  release?.status === "completed" &&
  (release.versionCodes || []).map(String).includes(String(version)) &&
  JSON.stringify(
    (release.releaseNotes || [])
      .map((note) => [note.language, note.text])
      .sort(([left], [right]) => left.localeCompare(right))
  ) ===
    JSON.stringify(
      notes
        .map((note) => [note.language, note.text])
        .sort(([left], [right]) => left.localeCompare(right))
    );

export async function publishInternal({ plan, run, save, client }) {
  if (!run.targets["android-internal"]) return;
  const stage = run.stages.androidInternal;
  if (
    run.targets["android-internal"].state === "complete" &&
    stage.state === "passed"
  )
    return;
  const { receipt, bytes } = candidate(plan, run);
  const grant = authorization(plan, receipt);
  if (!plan.privateReferences?.playCredentialRef)
    fail(
      "play_prerequisite_unavailable",
      "Private Play credential reference is required"
    );
  client ||= createPlayClient(
    plan.privateReferences.playCredentialRef,
    plan.targets["android-internal"].destinationIdentity
  );
  const app = plan.targets["android-internal"].destinationIdentity;
  const version = receipt.version.versionCode;
  const releaseName = `Clipp ${version} ${plan.id.slice(0, 8)} ${receipt.aab.sha256.slice(0, 12)}`;
  if (stage.releaseName && stage.releaseName !== releaseName)
    fail("play_conflict", "Saved publication differs from candidate");
  const grantSha256 = sha(JSON.stringify(grant));
  if (stage.authorizationSha256 && stage.authorizationSha256 !== grantSha256)
    fail(
      "publication_unauthorized",
      "Publication authorization changed during this run"
    );
  stage.releaseName = releaseName;
  stage.authorizationSha256 = grantSha256;
  const persist = () => {
    stage.updatedAt = now();
    run.updatedAt = stage.updatedAt;
    save();
  };
  const begin = (kind) => {
    const attempt = {
      number: stage.attempts.length + 1,
      kind,
      editId: stage.editId || null,
      state: "running",
      startedAt: now(),
    };
    stage.attempts.push(attempt);
    stage.pending = { kind, number: attempt.number };
    stage.state = "running";
    persist();
  };
  const finish = (state) => {
    const attempt = stage.attempts.find(
      (item) => item.number === stage.pending?.number
    );
    if (attempt) Object.assign(attempt, { state, finishedAt: now() });
    if (state !== "uncertain") stage.pending = null;
    persist();
  };
  // Inspect a pending operation before permitting recovery of a dead owner.
  const observedReleases = await client.releases("internal");
  let recoverable = !stage.pending;
  if (stage.pending?.kind === "commit")
    recoverable = observedReleases.some(
      (release) =>
        release.releaseName === releaseName &&
        (release.activeArtifacts || []).some(
          (artifact) => Number(artifact.versionCode) === Number(version)
        )
    );
  if (stage.pending?.kind === "upload" && stage.editId)
    recoverable = (await client.bundles(stage.editId)).some((bundle) =>
      sameBundle(bundle, receipt)
    );
  if (stage.pending?.kind === "track" && stage.editId) {
    const observedTrack = await client.track(stage.editId, "internal");
    recoverable = (observedTrack.releases || []).some((release) =>
      sameDraft(release, releaseName, version, grant.releaseNotes)
    );
  }
  const unlock = acquireOwnership(`play:${app}:internal`, {
    canRecover: () => recoverable,
  });
  try {
    const releases = await client.releases("internal");
    const published = releases.find((release) =>
      sameRelease(release, stage, version)
    );
    if (published) {
      if (!stage.upload || stage.upload.sha256 !== receipt.aab.sha256)
        fail(
          "play_conflict",
          "Remote release lacks attributable upload evidence"
        );
      stage.remoteRelease = published;
      stage.state = "passed";
      if (stage.pending?.kind === "commit") finish("reconciled");
      else stage.pending = null;
      run.targets["android-internal"] = {
        state: "complete",
        nextAction: null,
        updatedAt: now(),
      };
      persist();
      return;
    }
    const awaiting = releases.find(
      (release) =>
        release.releaseName === releaseName &&
        (release.activeArtifacts || []).some(
          (artifact) => Number(artifact.versionCode) === Number(version)
        )
    );
    if (awaiting) {
      if (!stage.upload || stage.upload.sha256 !== receipt.aab.sha256)
        fail(
          "play_conflict",
          "Remote release lacks attributable upload evidence"
        );
      stage.remoteRelease = awaiting;
      stage.state = "blocked";
      persist();
      fail(
        "play_release_pending",
        "Play release exists but is not yet published on the internal track"
      );
    }
    if (
      releases.some((release) =>
        (release.activeArtifacts || []).some(
          (artifact) => Number(artifact.versionCode) === Number(version)
        )
      )
    )
      fail(
        "play_conflict",
        "Version code already belongs to another Play release"
      );
    if (
      releases.some((release) =>
        (release.activeArtifacts || []).some(
          (artifact) => Number(artifact.versionCode) >= Number(version)
        )
      )
    )
      fail(
        "play_conflict",
        "Version code does not exceed current internal releases"
      );
    if (stage.pending?.kind === "insert" && !stage.editId)
      fail(
        "play_response_uncertain",
        "Play edit creation response was lost; cannot identify the edit safely"
      );
    if (!stage.editId) {
      begin("insert");
      let result;
      try {
        result = await client.insertEdit();
      } catch {
        finish("uncertain");
        fail(
          "play_response_uncertain",
          "Play edit creation response is uncertain"
        );
      }
      if (!result?.id) {
        finish("uncertain");
        fail("play_response_uncertain", "Play edit identifier is missing");
      }
      stage.editId = result.id;
      finish("accepted");
    } else {
      try {
        await client.getEdit(stage.editId);
      } catch {
        fail("play_response_uncertain", "Saved Play edit is not readable");
      }
    }
    const allTracks = await client.tracks(stage.editId);
    if (
      allTracks.some((track) =>
        (track.releases || []).some((release) =>
          (release.versionCodes || []).some(
            (code) =>
              Number(code) >= Number(version) &&
              !(track.track === "internal" && release.name === releaseName)
          )
        )
      )
    )
      fail("play_conflict", "Version code conflicts with a Play track");
    const bundles = await client.bundles(stage.editId);
    const matching = bundles.find((bundle) => sameBundle(bundle, receipt));
    if (
      bundles.some(
        (bundle) =>
          Number(bundle.versionCode) === Number(version) &&
          !sameBundle(bundle, receipt)
      )
    )
      fail(
        "play_conflict",
        "Play edit contains a different bundle for this version"
      );
    if (matching) {
      stage.upload = {
        versionCode: version,
        sha256: receipt.aab.sha256,
        editId: stage.editId,
      };
      if (stage.pending?.kind === "upload") finish("reconciled");
      else persist();
    } else if (stage.pending?.kind === "upload") {
      fail(
        "play_response_uncertain",
        "Upload outcome is not attributable in the Play edit"
      );
    } else {
      begin("upload");
      let uploaded;
      try {
        uploaded = await client.uploadBundle(stage.editId, bytes);
      } catch {
        finish("uncertain");
        fail(
          "play_response_uncertain",
          "Play bundle upload response is uncertain"
        );
      }
      if (!sameBundle(uploaded, receipt)) {
        finish("uncertain");
        fail(
          "play_response_uncertain",
          "Play upload response did not identify the AAB digest"
        );
      }
      stage.upload = {
        versionCode: version,
        sha256: receipt.aab.sha256,
        editId: stage.editId,
      };
      finish("accepted");
    }
    const track = await client.track(stage.editId, "internal");
    const draft = (track.releases || []).find((release) =>
      sameDraft(release, releaseName, version, grant.releaseNotes)
    );
    if (
      (track.releases || []).some(
        (release) =>
          (release.versionCodes || []).map(String).includes(String(version)) &&
          !draft
      )
    )
      fail(
        "play_conflict",
        "Internal edit contains another release for this version"
      );
    if (!draft && stage.pending?.kind === "track")
      fail("play_response_uncertain", "Track update outcome is unresolved");
    if (draft && stage.pending?.kind === "track") {
      finish("reconciled");
    }
    if (!draft) {
      const next = {
        ...track,
        track: "internal",
        releases: [
          ...(track.releases || []),
          {
            name: releaseName,
            status: "completed",
            versionCodes: [String(version)],
            releaseNotes: grant.releaseNotes,
          },
        ],
      };
      begin("track");
      try {
        await client.updateTrack(stage.editId, "internal", next);
      } catch {
        finish("uncertain");
        fail(
          "play_response_uncertain",
          "Play track update response is uncertain"
        );
      }
      finish("accepted");
    }
    stage.draft = {
      editId: stage.editId,
      name: releaseName,
      versionCode: version,
    };
    persist();
    if (stage.pending?.kind === "commit")
      fail(
        "play_response_uncertain",
        "Commit outcome awaits a matching remote release"
      );
    await client.validateEdit(stage.editId);
    begin("commit");
    try {
      await client.commitEdit(stage.editId);
    } catch {
      finish("uncertain");
      fail("play_response_uncertain", "Play commit response is uncertain");
    }
    const readback = await client.releases("internal");
    const completed = readback.find((release) =>
      sameRelease(release, stage, version)
    );
    if (!completed) {
      finish("uncertain");
      fail(
        "play_response_uncertain",
        "Completed release is not yet readable on the internal track"
      );
    }
    stage.remoteRelease = completed;
    finish("accepted");
    stage.state = "passed";
    persist();
    run.targets["android-internal"] = {
      state: "complete",
      nextAction: null,
      updatedAt: now(),
    };
    persist();
  } finally {
    unlock();
  }
}

export function createPlayClient(reference, applicationId, fetcher = fetch) {
  let token;
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(applicationId)}`;
  async function accessToken() {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    let service;
    try {
      service = JSON.parse(privateValue(reference));
    } catch {
      /* absent */
    }
    if (
      !service?.client_email ||
      !service.private_key ||
      service.token_uri !== "https://oauth2.googleapis.com/token"
    )
      fail(
        "play_prerequisite_unavailable",
        "Play service account credential is unavailable"
      );
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" })
    ).toString("base64url");
    const issued = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: service.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: service.token_uri,
        iat: issued,
        exp: issued + 3600,
      })
    ).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    let signature;
    try {
      signature = signer.sign(service.private_key).toString("base64url");
    } catch {
      fail(
        "play_prerequisite_unavailable",
        "Play service account key is invalid"
      );
    }
    const assertion = `${header}.${payload}.${signature}`;
    const response = await fetcher(service.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(30_000),
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok)
      fail(
        "play_prerequisite_unavailable",
        "Play credential authorization failed"
      );
    const result = await response.json();
    if (!result.access_token)
      fail("play_prerequisite_unavailable", "Play access token is missing");
    token = {
      value: result.access_token,
      expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
    };
    return token.value;
  }
  async function request(method, url, body, media = false) {
    const response = await fetcher(url, {
      method,
      signal: AbortSignal.timeout(media ? 900_000 : 60_000),
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        ...(body === undefined
          ? {}
          : {
              "content-type": media
                ? "application/octet-stream"
                : "application/json",
            }),
      },
      body:
        body === undefined ? undefined : media ? body : JSON.stringify(body),
    });
    if (!response.ok)
      fail(
        response.status === 403
          ? "play_prerequisite_unavailable"
          : "play_api_error",
        `Play API returned HTTP ${response.status}`
      );
    return response.status === 204 ? {} : response.json();
  }
  const edit = (id) => `${base}/edits/${encodeURIComponent(id)}`;
  return {
    releases: async (track) =>
      (
        await request(
          "GET",
          `${base}/tracks/${encodeURIComponent(track)}/releases`
        )
      ).releases || [],
    insertEdit: () => request("POST", `${base}/edits`, {}),
    getEdit: (id) => request("GET", edit(id)),
    bundles: async (id) =>
      (await request("GET", `${edit(id)}/bundles`)).bundles || [],
    uploadBundle: (id, bytes) =>
      request(
        "POST",
        `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(applicationId)}/edits/${encodeURIComponent(id)}/bundles?uploadType=media`,
        bytes,
        true
      ),
    track: (id, track) =>
      request("GET", `${edit(id)}/tracks/${encodeURIComponent(track)}`),
    tracks: async (id) =>
      (await request("GET", `${edit(id)}/tracks`)).tracks || [],
    updateTrack: (id, track, body) =>
      request("PUT", `${edit(id)}/tracks/${encodeURIComponent(track)}`, body),
    validateEdit: (id) => request("POST", `${edit(id)}:validate`, {}),
    commitEdit: (id) => request("POST", `${edit(id)}:commit`, {}),
  };
}
