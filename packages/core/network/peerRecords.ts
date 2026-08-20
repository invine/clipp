import type { KVStorageBackend } from "../trust/storage.js";

export const PEER_RECORDS_KEY = "signedPeerRecords";

export type SignedPeerRecordPersistence = {
  load(): Promise<Record<string, Uint8Array>>;
  save(peerId: string, record: Uint8Array): Promise<void>;
  remove(peerId: string): Promise<void>;
};

export function decodeSignedPeerRecordBytes(value: unknown): Uint8Array | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return undefined;
  }
  return Uint8Array.from(value);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/**
 * Peer stores return false for a valid record they have already consumed. Treat
 * an exact match as an idempotent refresh while still delegating changed
 * records to the peer store for signature, subject, and sequence validation.
 */
export async function consumeOrMatchSignedPeerRecord(
  peerStore: {
    get?(peerId: any): Promise<{ peerRecordEnvelope?: Uint8Array } | undefined>;
    consumePeerRecord?(record: Uint8Array, peerId: any): Promise<boolean>;
  } | undefined,
  expectedPeerId: any,
  record: Uint8Array
): Promise<boolean> {
  if (!peerStore) return false;
  const existing = await peerStore.get?.(expectedPeerId).catch(() => undefined);
  if (
    existing?.peerRecordEnvelope instanceof Uint8Array &&
    sameBytes(existing.peerRecordEnvelope, record)
  ) {
    return true;
  }
  return (await peerStore.consumePeerRecord?.(record, expectedPeerId)) === true;
}

export async function verifiedSignedPeerRecordMultiaddrs(
  record: Uint8Array,
  expectedPeerId: string
): Promise<string[]> {
  const { PeerRecord, RecordEnvelope } = await import("@libp2p/peer-record");
  const envelope = await RecordEnvelope.openAndCertify(record, PeerRecord.DOMAIN);
  const peerRecord = PeerRecord.createFromProtobuf(envelope.payload);
  if (peerRecord.peerId.toString() !== expectedPeerId) {
    throw new Error("signed_peer_record_subject_mismatch");
  }
  return peerRecord.multiaddrs.map(String);
}

export function createKVSignedPeerRecordPersistence(options: {
  storage: KVStorageBackend;
  key?: string;
}): SignedPeerRecordPersistence {
  const key = options.key ?? PEER_RECORDS_KEY;

  return {
    async load() {
      const stored = await options.storage.get<Record<string, unknown>>(key);
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};

      const records: Record<string, Uint8Array> = {};
      for (const [peerId, value] of Object.entries(stored)) {
        const record = decodeSignedPeerRecordBytes(value);
        if (peerId && record) records[peerId] = record;
      }
      return records;
    },

    async save(peerId, record) {
      const stored = await options.storage.get<Record<string, unknown>>(key);
      const records = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
      await options.storage.set(key, { ...records, [peerId]: Array.from(record) });
    },

    async remove(peerId) {
      const stored = await options.storage.get<Record<string, unknown>>(key);
      if (!stored || typeof stored !== "object" || Array.isArray(stored) || !(peerId in stored)) return;
      const remaining = { ...stored };
      delete remaining[peerId];
      await options.storage.set(key, remaining);
    },
  };
}
