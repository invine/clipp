/**
 * Handles SyncMessage encoding/decoding for libp2p protocol.
 */
import { SyncMessage } from "../models/SyncMessage";

const PROTOCOL = "/clipp/sync/1.0.0";

export function encodeMessage(msg: SyncMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeMessage(data: Uint8Array): SyncMessage {
  return JSON.parse(new TextDecoder().decode(data));
}

export { PROTOCOL };
