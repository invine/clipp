import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPlayClient,
  publishInternal,
} from "../../scripts/delivery/android-internal.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const outputRoot = mkdtempSync(path.join(os.tmpdir(), "clipp-play-test-"));
  const bytes = Buffer.from("signed-aab-candidate");
  writeFileSync(path.join(outputRoot, "app.aab"), bytes);
  const digest = sha(bytes);
  const certificate = "a".repeat(64);
  const signingFile = path.join(outputRoot, "signing.json");
  writeFileSync(
    signingFile,
    JSON.stringify({ certificateSha256: certificate })
  );
  const plan = {
    id: "11111111-1111-4111-8111-111111111111",
    outputRoot,
    source: { commit: "b".repeat(40) },
    targets: {
      "android-internal": {
        destinationIdentity: "com.clipp.app",
        track: "internal",
      },
    },
    destinations: { playTrack: "internal" },
    privateReferences: { androidSigningRef: `file:${signingFile}` },
  };
  const run = {
    stages: {
      androidPackage: {
        state: "passed",
        receipt: {
          source: plan.source.commit,
          signing: "upload",
          qualification: {
            appSha256: "c".repeat(64),
            testSha256: "d".repeat(64),
          },
          signature: { state: "upload", certificateSha256: certificate },
          version: { applicationId: "com.clipp.app", versionCode: 42 },
          aab: { path: "app.aab", sha256: digest },
        },
      },
      androidInternal: { state: "pending", attempts: [] },
    },
    androidQualification: {
      state: "passed",
      pair: { appSha256: "c".repeat(64), testSha256: "d".repeat(64) },
    },
    targets: { "android-internal": { state: "pending" } },
  };
  const calls = [];
  const client = {
    async releases() {
      calls.push("releases");
      return [];
    },
    async insertEdit() {
      calls.push("insert");
      return { id: "edit-1" };
    },
    async getEdit() {
      calls.push("getEdit");
      return { id: "edit-1" };
    },
    async bundles() {
      calls.push("bundles");
      return [];
    },
    async uploadBundle() {
      calls.push("upload");
      return { versionCode: 42, sha256: digest };
    },
    async track() {
      calls.push("track");
      return { releases: [] };
    },
    async tracks() {
      calls.push("tracks");
      return [];
    },
    async updateTrack() {
      calls.push("update");
      return {};
    },
    async validateEdit() {
      calls.push("validate");
      return {};
    },
    async commitEdit() {
      calls.push("commit");
      return {};
    },
  };
  return { plan, run, client, calls, digest, certificate, save() {} };
}

function authorize(f) {
  const file = path.join(f.plan.outputRoot, "authorization.json");
  writeFileSync(
    file,
    JSON.stringify({
      applicationId: "com.clipp.app",
      track: "internal",
      sourceCommit: f.plan.source.commit,
      aabSha256: f.digest,
      versionCode: 42,
      certificateSha256: f.certificate,
      releaseNotes: [{ language: "en-US", text: "Internal validation" }],
      authorizedBy: "operator",
      authorizedAt: "2026-11-10T00:00:00Z",
    })
  );
  f.plan.privateReferences.playAuthorizationRef = `file:${file}`;
  f.plan.privateReferences.playCredentialRef =
    "env:CLIPP_UNUSED_TEST_CREDENTIAL";
}

test("internal publication blocks before Play access without matching private authorization", async () => {
  const f = fixture();
  await assert.rejects(publishInternal(f), {
    code: "publication_unauthorized",
  });
  assert.deepEqual(f.calls, []);
});

test("unsigned or changed AAB never reaches Play", async () => {
  const unsigned = fixture();
  authorize(unsigned);
  unsigned.run.stages.androidPackage.receipt.signing = "unsigned-artifact";
  await assert.rejects(publishInternal(unsigned), {
    code: "play_prerequisite_unavailable",
  });
  assert.deepEqual(unsigned.calls, []);

  const changed = fixture();
  authorize(changed);
  writeFileSync(
    path.join(changed.plan.outputRoot, "app.aab"),
    "different bytes"
  );
  await assert.rejects(publishInternal(changed), {
    code: "android_artifact_invalid",
  });
  assert.deepEqual(changed.calls, []);
});

test("internal publication records a completed track readback and replays without writes", async () => {
  const f = fixture();
  const authorization = {
    applicationId: "com.clipp.app",
    track: "internal",
    sourceCommit: f.plan.source.commit,
    aabSha256: f.digest,
    versionCode: 42,
    certificateSha256: f.certificate,
    releaseNotes: [{ language: "en-US", text: "Internal validation" }],
    authorizedBy: "operator",
    authorizedAt: "2026-11-10T00:00:00Z",
  };
  const file = path.join(f.plan.outputRoot, "authorization.json");
  writeFileSync(file, JSON.stringify(authorization));
  f.plan.privateReferences.playAuthorizationRef = `file:${file}`;
  f.plan.privateReferences.playCredentialRef =
    "env:CLIPP_UNUSED_TEST_CREDENTIAL";
  const signingFile = path.join(f.plan.outputRoot, "signing.json");
  writeFileSync(
    signingFile,
    JSON.stringify({ certificateSha256: f.certificate })
  );
  f.plan.privateReferences.androidSigningRef = `file:${signingFile}`;
  f.client.releases = async () => {
    f.calls.push("releases");
    return f.calls.includes("commit")
      ? [
          {
            releaseName: f.run.stages.androidInternal.releaseName,
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
            activeArtifacts: [{ versionCode: 42 }],
          },
        ]
      : [];
  };
  await publishInternal(f);
  assert.equal(f.run.targets["android-internal"].state, "complete");
  assert.equal(f.calls.filter((call) => call === "upload").length, 1);
  assert.equal(f.calls.filter((call) => call === "commit").length, 1);
  assert.deepEqual(
    f.run.stages.androidInternal.attempts.map((item) => [
      item.kind,
      item.state,
    ]),
    [
      ["insert", "accepted"],
      ["upload", "accepted"],
      ["track", "accepted"],
      ["commit", "accepted"],
    ]
  );
  await publishInternal(f);
  assert.equal(f.calls.filter((call) => call === "commit").length, 1);
});

test("lost upload response reconciles bundle digest before retry", async () => {
  const f = fixture();
  const file = path.join(f.plan.outputRoot, "authorization.json");
  writeFileSync(
    file,
    JSON.stringify({
      applicationId: "com.clipp.app",
      track: "internal",
      sourceCommit: f.plan.source.commit,
      aabSha256: f.digest,
      versionCode: 42,
      certificateSha256: f.certificate,
      releaseNotes: [{ language: "en-US", text: "Internal validation" }],
      authorizedBy: "operator",
      authorizedAt: "2026-11-10T00:00:00Z",
    })
  );
  f.plan.privateReferences.playAuthorizationRef = `file:${file}`;
  f.plan.privateReferences.playCredentialRef =
    "env:CLIPP_UNUSED_TEST_CREDENTIAL";
  const signingFile = path.join(f.plan.outputRoot, "signing.json");
  writeFileSync(
    signingFile,
    JSON.stringify({ certificateSha256: f.certificate })
  );
  f.plan.privateReferences.androidSigningRef = `file:${signingFile}`;
  let uploaded = false;
  f.client.uploadBundle = async () => {
    uploaded = true;
    f.calls.push("upload");
    throw new Error("lost response");
  };
  f.client.bundles = async () => {
    f.calls.push("bundles");
    return uploaded ? [{ versionCode: 42, sha256: f.digest }] : [];
  };
  f.client.releases = async () => {
    f.calls.push("releases");
    return f.calls.includes("commit")
      ? [
          {
            releaseName: f.run.stages.androidInternal.releaseName,
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
            activeArtifacts: [{ versionCode: 42 }],
          },
        ]
      : [];
  };
  await assert.rejects(publishInternal(f), { code: "play_response_uncertain" });
  assert.equal(f.run.stages.androidInternal.attempts.at(-1).state, "uncertain");
  await publishInternal(f);
  assert.equal(f.calls.filter((call) => call === "upload").length, 1);
  assert.equal(f.run.targets["android-internal"].state, "complete");
  assert.equal(f.run.stages.androidInternal.attempts[1].state, "reconciled");
});

test("version collision with a different release blocks before edit creation", async () => {
  const f = fixture();
  authorize(f);
  f.client.releases = async () => [
    {
      releaseName: "another release",
      releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
      activeArtifacts: [{ versionCode: 42 }],
    },
  ];
  await assert.rejects(publishInternal(f), { code: "play_conflict" });
  assert.equal(f.calls.includes("insert"), false);
});

test("version code on another Play track blocks before upload", async () => {
  const f = fixture();
  authorize(f);
  f.client.tracks = async () => [
    { track: "production", releases: [{ versionCodes: ["42"] }] },
  ];
  await assert.rejects(publishInternal(f), { code: "play_conflict" });
  assert.equal(f.calls.includes("upload"), false);
});

test("same version with another AAB digest is never attributed to this run", async () => {
  const f = fixture();
  authorize(f);
  f.client.bundles = async () => [{ versionCode: 42, sha256: "f".repeat(64) }];
  await assert.rejects(publishInternal(f), { code: "play_conflict" });
  assert.equal(f.calls.includes("upload"), false);
});

test("draft with matching version but different release notes is a conflict", async () => {
  const f = fixture();
  authorize(f);
  f.client.track = async () => ({
    releases: [
      {
        name: f.run.stages.androidInternal.releaseName,
        status: "completed",
        versionCodes: ["42"],
        releaseNotes: [{ language: "en-US", text: "Different notes" }],
      },
    ],
  });
  await assert.rejects(publishInternal(f), { code: "play_conflict" });
  assert.equal(f.calls.includes("commit"), false);
});

test("lost commit response reconciles published release without another commit", async () => {
  const f = fixture();
  authorize(f);
  let committed = false;
  f.client.commitEdit = async () => {
    f.calls.push("commit");
    committed = true;
    throw new Error("response lost");
  };
  f.client.releases = async () =>
    committed
      ? [
          {
            releaseName: f.run.stages.androidInternal.releaseName,
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
            activeArtifacts: [{ versionCode: 42 }],
          },
        ]
      : [];
  await assert.rejects(publishInternal(f), { code: "play_response_uncertain" });
  await publishInternal(f);
  assert.equal(f.run.targets["android-internal"].state, "complete");
  assert.equal(f.calls.filter((call) => call === "commit").length, 1);
});

test("review pending release stays incomplete after commit", async () => {
  const f = fixture();
  authorize(f);
  let committed = false;
  f.client.commitEdit = async () => {
    committed = true;
    f.calls.push("commit");
    return {};
  };
  f.client.releases = async () =>
    committed
      ? [
          {
            releaseName: f.run.stages.androidInternal.releaseName,
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_IN_REVIEW",
            activeArtifacts: [{ versionCode: 42 }],
          },
        ]
      : [];
  await assert.rejects(publishInternal(f), { code: "play_response_uncertain" });
  await assert.rejects(publishInternal(f), { code: "play_release_pending" });
  assert.equal(f.calls.filter((call) => call === "commit").length, 1);
});

test("lost track update resumes the attributable draft without another update", async () => {
  const f = fixture();
  authorize(f);
  let draft;
  f.client.track = async () => ({ releases: draft ? [draft] : [] });
  f.client.updateTrack = async (_edit, _track, body) => {
    f.calls.push("update");
    draft = body.releases.at(-1);
    throw new Error("response lost");
  };
  f.client.releases = async () =>
    f.calls.includes("commit")
      ? [
          {
            releaseName: f.run.stages.androidInternal.releaseName,
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
            activeArtifacts: [{ versionCode: 42 }],
          },
        ]
      : [];
  await assert.rejects(publishInternal(f), { code: "play_response_uncertain" });
  await publishInternal(f);
  assert.equal(f.calls.filter((call) => call === "update").length, 1);
  assert.equal(f.run.targets["android-internal"].state, "complete");
});

test("concurrent runs cannot own the same application and track", async () => {
  const first = fixture();
  authorize(first);
  const second = fixture();
  authorize(second);
  second.plan.targets["android-internal"].destinationIdentity =
    first.plan.targets["android-internal"].destinationIdentity;
  let entered;
  const held = new Promise((resolve) => {
    entered = resolve;
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  first.client.insertEdit = async () => {
    entered();
    await gate;
    return { id: "edit-1" };
  };
  first.client.releases = async () =>
    first.calls.includes("commit")
      ? [
          {
            releaseName: first.run.stages.androidInternal.releaseName,
            releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
            activeArtifacts: [{ versionCode: 42 }],
          },
        ]
      : [];
  const running = publishInternal(first);
  await held;
  try {
    await assert.rejects(publishInternal(second), { code: "resource_owned" });
  } finally {
    release();
  }
  await running;
});

test("Play client uses private OAuth token and internal release readback endpoint", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "clipp-play-client-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const file = path.join(root, "credential.json");
  writeFileSync(
    file,
    JSON.stringify({
      client_email: "clipp@example.test",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      token_uri: "https://oauth2.googleapis.com/token",
    })
  );
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return url.includes("oauth2")
      ? {
          ok: true,
          json: async () => ({
            access_token: "private-token",
            expires_in: 3600,
          }),
        }
      : {
          ok: true,
          json: async () => ({
            releases: [
              {
                releaseName: "test",
                activeArtifacts: [{ versionCode: 42 }],
                releaseLifecycleState: "RELEASE_LIFECYCLE_STATE_PUBLISHED",
              },
            ],
          }),
        };
  };
  const releases = await createPlayClient(
    `file:${file}`,
    "com.clipp.app",
    fetcher
  ).releases("internal");
  assert.equal(releases[0].releaseName, "test");
  assert.equal(
    calls[1].url,
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.clipp.app/tracks/internal/releases"
  );
  assert.equal(calls[1].options.headers.authorization, "Bearer private-token");
  assert.equal(
    calls[0].options.body.get("grant_type"),
    "urn:ietf:params:oauth:grant-type:jwt-bearer"
  );
});
