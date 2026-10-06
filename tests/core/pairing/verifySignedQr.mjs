// Runs in native ESM so this integration exercises real libp2p crypto, which
// Jest's CommonJS transform cannot load. The fixture contains public data only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { createPairingCode } from "../../../packages/core/pairing/qrCode.ts";
import {
  encodePairingTarget,
  decodePairingTarget,
} from "../../../packages/core/pairing/v2.ts";
import { importPairingTargetAndRequest } from "../../../packages/core/pairing/target.ts";
import { verifiedSignedPeerRecordMultiaddrs } from "../../../packages/core/network/peerRecords.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/signed-qr-target.json", import.meta.url),
    "utf8"
  )
);
const record = Uint8Array.from(Buffer.from(fixture.signedPeerRecord, "base64"));
let dialed = false;
let requested = false;
let importedAddresses = [];
const network = {
  start: async () => {},
  stop: async () => {},
  send: async () => {},
  onMessage: () => {},
  onPeerConnected: () => {},
  onPeerDisconnected: () => {},
  onSelfPeerUpdate: () => {},
  getConnectedPeers: () => [],
  importSignedPeerRecord: async (peerId, bytes) => {
    importedAddresses = await verifiedSignedPeerRecordMultiaddrs(bytes, peerId);
  },
  connect: async (peerId) => {
    assert.equal(peerId, fixture.targetPeerId);
    dialed = true;
  },
};
const request = async (peerId) => {
  assert.equal(peerId, fixture.targetPeerId);
  requested = true;
  return new Uint8Array();
};
async function scanTarget(targetPeerId, signedPeerRecord) {
  const text = encodePairingTarget({
    targetPeerId,
    signedPeerRecord,
    deviceNameHint: "Desktop 📋",
  });
  const code = await createPairingCode(text);
  assert.ok(code.image);
  assert.equal(code.text, text);
  const png = PNG.sync.read(Buffer.from(code.image.split(",")[1], "base64"));
  const scanned = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(scanned);
  assert.ok(scanned.data.startsWith("CLIPP:PAIR:Z1:"));
  assert.deepEqual(
    decodePairingTarget(scanned.data).signedPeerRecord,
    signedPeerRecord
  );
  return scanned.data;
}

const text = await scanTarget(fixture.targetPeerId, record);
await importPairingTargetAndRequest({ text, network, request });
assert.equal(importedAddresses.length, fixture.addressCount);
assert.ok(dialed && requested);

const damagedRecord = Uint8Array.from(record);
damagedRecord[damagedRecord.length - 1] ^= 1;
for (const [peerId, bytes] of [
  [fixture.targetPeerId, damagedRecord],
  ["12D3KooWGVgpvsG4YReZDibWrpQvVVWxh2njEoR4dvrmHPp3tDex", record],
]) {
  dialed = requested = false;
  await assert.rejects(
    importPairingTargetAndRequest({
      text: await scanTarget(peerId, bytes),
      network,
      request,
    })
  );
  assert.equal(dialed, false);
  assert.equal(requested, false);
}
console.log(
  "verified all 20 addresses; blocked damaged signature and mismatched identity"
);
