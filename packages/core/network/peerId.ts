import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { peerIdFromString, type PeerId } from "@libp2p/peer-id";

/**
 * Convert our UUID-style deviceId into a libp2p-compatible PeerId string
 * by hashing and encoding as a CIDv1 with the libp2p-peer codec (0x72).
 * Uses multiformats digest to produce a valid multihash.
 */
export async function deviceIdToPeerId(deviceId: string): Promise<string> {
  const bytes = new TextEncoder().encode(deviceId);
  const digest = await sha256.digest(bytes);
  const cid = CID.createV1(0x72, digest);
  return cid.toString();
}

export async function deviceIdToPeerIdObject(deviceId: string): Promise<PeerId> {
  const pidStr = await deviceIdToPeerId(deviceId);
  return await peerIdFromString(pidStr);
}
