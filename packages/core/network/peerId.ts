import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
// TODO: replace depricated module import
import { peerIdFromPrivateKey, peerIdFromString } from "@libp2p/peer-id";
import type { PeerId } from "@libp2p/interface";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { base58btc } from "multiformats/bases/base58";

/**
 * Convert our UUID-style deviceId into a libp2p-compatible PeerId string
 * by hashing and encoding as a CIDv1 with the libp2p-peer codec (0x72).
 * Uses multiformats digest to produce a valid multihash.
 */
// TODO: why this is async function?
export async function deviceIdToPeerId(deviceId: string): Promise<string> {
  const pid = await decodePeerId(deviceId);
  if (pid) return peerIdToString(pid);
  // fallback to hash
  const bytes = new TextEncoder().encode(deviceId);
  const digest = await sha256.digest(bytes);
  const cid = CID.createV1(0x72, digest);
  const hashed = await peerIdFromString(cid.toString());
  return peerIdToString(hashed);
}

// TODO: why this is async function?
export async function deviceIdToPeerIdObject(deviceId: string): Promise<PeerId> {
  const pid = await decodePeerId(deviceId);
  if (pid) return pid;
  const pidStr = await deviceIdToPeerId(deviceId);
  return await peerIdFromString(pidStr);
}

// TODO: why this is async function?
export async function normalizePeerId(value: string): Promise<string> {
  const pid = await decodePeerId(value);
  if (pid) return peerIdToString(pid);
  const fallback = await peerIdFromString(value, base58btc);
  return peerIdToString(fallback);
}

// TODO: why this is async function?
export async function peerIdFromPrivateKeyBase64(b64: string): Promise<PeerId> {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const priv = await privateKeyFromProtobuf(bytes);
  const pid = peerIdFromPrivateKey(priv);
  return pid;
}

export function peerIdToString(pid: PeerId): string {
  try {
    return pid.toString();
  } catch {
    // ignore and try fallbacks
  }
  try {
    if (typeof (pid as any).toCID === "function") {
      const cid = (pid as any).toCID();
      if (cid?.toString) {
        const str = cid.toString(base58btc);
        return str.startsWith("z") ? str.slice(1) : str;
      }
    }
  } catch {
    // ignore
  }
  try {
    return `${pid}`;
  } catch {
    return "";
  }
}

async function decodePeerId(value: string): Promise<PeerId | null> {
  try {
    return await peerIdFromString(value);
  } catch {
    try {
      return await peerIdFromString(value, base58btc);
    } catch {
      // ignore
    }
    // try CID parse (base32/36 etc.)
    try {
      const cid = CID.parse(value);
      const v1 = cid.toV1();
      const as58 = v1.toString(base58btc);
      return await peerIdFromString(as58, base58btc);
    } catch {
      return null;
    }
  }
}
