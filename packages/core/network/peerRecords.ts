import type { KVStorageBackend } from "../trust/storage.js";

export const PEER_RECORDS_KEY = "signedPeerRecords";

export type SignedPeerRecordPersistence = {
  load(): Promise<Record<string, Uint8Array>>;
  save(peerId: string, record: Uint8Array): Promise<void>;
  remove(peerId: string): Promise<void>;
};

export function decodeSignedPeerRecordBytes(
  value: unknown
): Uint8Array | undefined {
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
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

/**
 * Peer stores return false for a valid record they have already consumed. Treat
 * an exact match as an idempotent refresh while still delegating changed
 * records to the peer store for signature, subject, and sequence validation.
 */
export async function consumeOrMatchSignedPeerRecord(
  peerStore:
    | {
        get?(
          peerId: any
        ): Promise<{ peerRecordEnvelope?: Uint8Array } | undefined>;
        consumePeerRecord?(record: Uint8Array, peerId: any): Promise<boolean>;
      }
    | undefined,
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
  const envelope = await RecordEnvelope.openAndCertify(
    record,
    PeerRecord.DOMAIN
  );
  const peerRecord = PeerRecord.createFromProtobuf(envelope.payload);
  if (peerRecord.peerId.toString() !== expectedPeerId) {
    throw new Error("signed_peer_record_subject_mismatch");
  }
  return peerDialTargets(expectedPeerId, peerRecord.multiaddrs.map(String));
}

/** Bind derived dial addresses to their owner without changing the signed record. */
export function peerDialTargets(peerId: string, addresses: string[]): string[] {
  const suffix = `/p2p/${peerId}`;
  return addresses.flatMap((address) => {
    const trimmed = address.trim();
    if (!trimmed.startsWith("/")) return [];
    const destination = trimmed.match(/\/p2p\/([^/]+)$/)?.[1];
    if (destination && destination !== peerId) return [];
    return [destination ? trimmed : `${trimmed}${suffix}`];
  });
}

/** A valid older Pairing Target may use retained, newer verified reachability. */
export async function newerVerifiedSignedPeerRecord(
  existing: Uint8Array,
  incoming: Uint8Array,
  expectedPeerId: string
): Promise<Uint8Array | undefined> {
  const { PeerRecord, RecordEnvelope } = await import("@libp2p/peer-record");
  const verify = async (bytes: Uint8Array) => {
    const envelope = await RecordEnvelope.openAndCertify(
      bytes,
      PeerRecord.DOMAIN
    );
    const record = PeerRecord.createFromProtobuf(envelope.payload);
    if (
      record.peerId.toString() !== expectedPeerId ||
      !envelope.publicKey.toCID().equals(record.peerId.toCID())
    )
      throw new Error("signed_peer_record_subject_mismatch");
    return record;
  };
  const [stored, received] = await Promise.all([
    verify(existing),
    verify(incoming),
  ]);
  return stored.seqNumber >= received.seqNumber
    ? Uint8Array.from(existing)
    : undefined;
}

export function createKVSignedPeerRecordPersistence(options: {
  storage: KVStorageBackend;
  key?: string;
}): SignedPeerRecordPersistence {
  const key = options.key ?? PEER_RECORDS_KEY;

  return {
    async load() {
      const stored = await options.storage.get<Record<string, unknown>>(key);
      if (!stored || typeof stored !== "object" || Array.isArray(stored))
        return {};

      const records: Record<string, Uint8Array> = {};
      for (const [peerId, value] of Object.entries(stored)) {
        const record = decodeSignedPeerRecordBytes(value);
        if (peerId && record) records[peerId] = record;
      }
      return records;
    },

    async save(peerId, record) {
      const stored = await options.storage.get<Record<string, unknown>>(key);
      const records =
        stored && typeof stored === "object" && !Array.isArray(stored)
          ? stored
          : {};
      await options.storage.set(key, {
        ...records,
        [peerId]: Array.from(record),
      });
    },

    async remove(peerId) {
      const stored = await options.storage.get<Record<string, unknown>>(key);
      if (
        !stored ||
        typeof stored !== "object" ||
        Array.isArray(stored) ||
        !(peerId in stored)
      )
        return;
      const remaining = { ...stored };
      delete remaining[peerId];
      await options.storage.set(key, remaining);
    },
  };
}
