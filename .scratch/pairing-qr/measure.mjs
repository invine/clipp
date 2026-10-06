// Exploration only: read public Signed Peer Records from a SQLite profile.
// Usage: node --import tsx .scratch/pairing-qr/measure.mjs /path/to/clipp.sqlite
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PeerRecord, RecordEnvelope } from "@libp2p/peer-record";
import {
  encodePairingTarget,
  decodePairingTarget,
} from "../../packages/core/pairing/v2.ts";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
function base45(bytes) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 2) {
    let value = bytes[i];
    const pair = i + 1 < bytes.length;
    if (pair) value = value * 256 + bytes[i + 1];
    result += alphabet[value % 45];
    value = Math.floor(value / 45);
    result += alphabet[value % 45];
    if (pair) result += alphabet[Math.floor(value / 45)];
  }
  return result;
}
function unbase45(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 3) {
    const pair = i + 2 < text.length;
    const value =
      alphabet.indexOf(text[i]) +
      45 * alphabet.indexOf(text[i + 1]) +
      (pair ? 2025 * alphabet.indexOf(text[i + 2]) : 0);
    if (pair) bytes.push(Math.floor(value / 256), value % 256);
    else bytes.push(value);
  }
  return Buffer.from(bytes);
}
function scan(segments, errorCorrectionLevel = "L") {
  let qr;
  try {
    qr = QRCode.create(segments, { errorCorrectionLevel });
  } catch (error) {
    return { fits: false, error: error.message };
  }
  const scale = 4;
  const width = (qr.modules.size + 8) * scale;
  const rgba = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < qr.modules.size; y++) {
    for (let x = 0; x < qr.modules.size; x++) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const index =
            (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4;
          rgba[index] = rgba[index + 1] = rgba[index + 2] = 0;
        }
      }
    }
  }
  const decoded = jsQR(rgba, width, width);
  if (!decoded)
    return {
      fits: true,
      version: qr.version,
      modules: qr.modules.size,
      scanSucceeded: false,
    };
  if (typeof segments === "string") assert.equal(decoded.data, segments);
  else
    assert.deepEqual(
      Buffer.from(decoded.binaryData),
      Buffer.from(segments[0].data)
    );
  return {
    fits: true,
    version: qr.version,
    modules: qr.modules.size,
    scanSucceeded: true,
    decoded,
  };
}
function summary(result) {
  const { decoded, ...rest } = result;
  return rest;
}

for (const path of process.argv.slice(2)) {
  const raw = execFileSync(
    "sqlite3",
    ["-readonly", path, "SELECT value FROM kv WHERE key = 'signedPeerRecords'"],
    { encoding: "utf8" }
  ).trim();
  const records = raw ? JSON.parse(raw) : {};
  let sample = 0;
  for (const bytes of Object.values(records)) {
    const envelope = Uint8Array.from(bytes);
    const verified = await RecordEnvelope.openAndCertify(
      envelope,
      PeerRecord.DOMAIN
    );
    const record = PeerRecord.createFromProtobuf(verified.payload);
    const original = encodePairingTarget({
      targetPeerId: record.peerId.toString(),
      signedPeerRecord: envelope,
    });
    const payload = Buffer.from(
      original.slice("clipp:pair:".length),
      "base64url"
    );
    const compressed = deflateSync(payload, { level: 9 });
    assert.deepEqual(
      inflateSync(compressed, { maxOutputLength: 16384 }),
      payload
    );
    const encodings = {
      current: original,
      deflateBase64url: `clipp:pair:z:${compressed.toString("base64url")}`,
      base45: `CLIPP:PAIR:B:${base45(payload)}:`,
      deflateBase45: `CLIPP:PAIR:Z:${base45(compressed)}:`,
    };
    const results = {};
    for (const [name, text] of Object.entries(encodings)) {
      const scanned = scan(text);
      results[name] = { characters: text.length, ...summary(scanned) };
      if (name === "deflateBase45" && scanned.fits) {
        assert.ok(
          scanned.scanSucceeded,
          "compressed Base45 must scan for the measured records"
        );
        const restored = inflateSync(
          unbase45(scanned.decoded.data.slice("CLIPP:PAIR:Z:".length, -1)),
          { maxOutputLength: 16384 }
        );
        assert.deepEqual(restored, payload);
        assert.deepEqual(
          decodePairingTarget(`clipp:pair:${restored.toString("base64url")}`)
            .signedPeerRecord,
          envelope
        );
      }
    }
    const binary = scan([{ data: Uint8Array.from(compressed), mode: "byte" }]);
    const strongerCorrection = {};
    for (const level of ["M", "Q", "H"]) {
      strongerCorrection[level] = summary(scan(encodings.deflateBase45, level));
    }
    const addressTypes = {};
    for (const addr of record.multiaddrs) {
      const s = addr.toString();
      const kind = s.includes("/p2p-circuit")
        ? "relay"
        : s.includes("/webrtc-direct")
          ? "webrtc-direct"
          : s.includes("/ws")
            ? "websocket"
            : s.includes("/tcp")
              ? "tcp"
              : "other";
      addressTypes[kind] = (addressTypes[kind] ?? 0) + 1;
    }
    console.log(
      JSON.stringify({
        profile: path.includes(".local/") ? "test-profile" : "desktop-profile",
        sample: ++sample,
        recordBytes: envelope.length,
        payloadBytes: payload.length,
        compressedBytes: compressed.length,
        addresses: record.multiaddrs.length,
        addressTypes,
        results,
        deflateBinary: summary(binary),
        strongerCorrection,
      })
    );
  }
}
