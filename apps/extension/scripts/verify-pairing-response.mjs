import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixturePath = await mkdtemp(
  join(tmpdir(), "clipp-pairing-response-fixture-")
);
const profilePath = await mkdtemp(
  join(tmpdir(), "clipp-pairing-response-profile-")
);
let context;
try {
  await writeFile(
    join(fixturePath, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Clipp Pairing Response Test",
      version: "1.0.0",
      background: { service_worker: "worker.js", type: "module" },
    })
  );
  await build({
    stdin: {
      resolveDir: scriptDirectory,
      sourcefile: "pairing-response-fixture.ts",
      contents: `
        import { generateKeyPair } from '@libp2p/crypto/keys';
        import { peerIdFromPrivateKey } from '@libp2p/peer-id';
        import { createPairingRuntimeSessions } from '../../../packages/core/pairing/runtimeCoordinator';
        import { decodePairingFrame, encodePairingFrame } from '../../../packages/core/pairing/protocol';
        import { verifyExtensionPairingTrustRequestSignature } from '../src/pairingSignature';
        globalThis.runPairingScenario = async (tamperSignature = false) => {
          const key = await generateKeyPair('Ed25519');
          const localPeerId = peerIdFromPrivateKey(key).toString();
          const targetPeerId = peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
          const admitted = new Set([localPeerId]);
          const diagnostics = [];
          let outgoing;
          const sessions = createPairingRuntimeSessions({
            identity: async () => ({ peerId: localPeerId, deviceName: 'Extension', nameRevision: 0 }),
            send: async (_target, frame) => { outgoing = frame; },
            sign: (bytes) => key.sign(bytes),
            verify: verifyExtensionPairingTrustRequestSignature,
            membership: {
              membershipStatus: async (peerId) => admitted.has(peerId) ? 'active' : 'unknown',
              admit: async (peerId) => { admitted.add(peerId); return 'admitted'; },
            },
            clock: { now: () => 1000, setTimeout: () => 0, clearTimeout: () => {} },
            onRejected: (diagnostic) => diagnostics.push(diagnostic.reason),
          });
          sessions.start();
          try {
            await sessions.request(targetPeerId);
            const request = decodePairingFrame(outgoing);
            if (request?.kind !== 'request') throw new Error('missing_request');
            const requestEnvelope = Uint8Array.from(request.envelope);
            if (tamperSignature) requestEnvelope[requestEnvelope.length - 1] ^= 1;
            const response = encodePairingFrame({ kind: 'response', response: {
              decision: 'accepted', requestEnvelope,
              responderDeviceName: 'Desktop', responderNameRevision: 0n,
            }});
            const decision = await sessions.receive(targetPeerId, response, async () => false);
            return { decision, waiting: sessions.waiting().length, admitted: admitted.has(targetPeerId), diagnostics };
          } finally { await sessions.stop(); }
        };
      `,
    },
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "chrome109",
    outdir: fixturePath,
    entryNames: "worker",
    logLevel: "silent",
  });
  context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${fixturePath}`,
      `--load-extension=${fixturePath}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  const result = await worker.evaluate(
    async () => await globalThis.runPairingScenario()
  );
  console.log("MV3 accepted Pairing response:", JSON.stringify(result));
  assert.equal(
    result.decision,
    "accepted",
    "the extension must accept the desktop's valid Trust Response"
  );
  assert.equal(
    result.waiting,
    0,
    "accepted Pairing must clear Waiting for approval"
  );
  assert.equal(
    result.admitted,
    true,
    "accepted Pairing must admit the desktop"
  );
  const tampered = await worker.evaluate(
    async () => await globalThis.runPairingScenario(true)
  );
  assert.equal(
    tampered.decision,
    null,
    "a tampered signature must not authorize Pairing"
  );
  assert.equal(tampered.waiting, 1);
  assert.equal(tampered.admitted, false);
  assert.deepEqual(tampered.diagnostics, ["invalid_signature"]);
  console.log("MV3 tampered Pairing response rejected.");
} finally {
  await context?.close();
  await rm(profilePath, { recursive: true, force: true });
  await rm(fixturePath, { recursive: true, force: true });
}
