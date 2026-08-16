import {
  consumeOrMatchSignedPeerRecord,
  createKVSignedPeerRecordPersistence,
} from "../../../packages/core/network/peerRecords";
import type { KVStorageBackend } from "../../../packages/core/trust";

class MemoryKVStorage implements KVStorageBackend {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe("KV Signed Peer Record storage", () => {
  it("round-trips valid records and ignores malformed persisted bytes", async () => {
    const storage = new MemoryKVStorage();
    storage.values.set("signedPeerRecords", {
      valid: [1, 2, 255],
      negative: [1, -1],
      fractional: [1, 2.5],
      notBytes: "AQI=",
    });
    const records = createKVSignedPeerRecordPersistence({ storage });

    expect(await records.load()).toEqual({ valid: Uint8Array.of(1, 2, 255) });

    await records.save("new-peer", Uint8Array.of(7, 8, 9));

    expect(await records.load()).toEqual({
      valid: Uint8Array.of(1, 2, 255),
      "new-peer": Uint8Array.of(7, 8, 9),
    });
  });

  it("accepts an already-consumed exact record as an idempotent refresh", async () => {
    const record = Uint8Array.of(1, 2, 3);
    const peerStore = {
      get: jest.fn(async () => ({ peerRecordEnvelope: Uint8Array.from(record) })),
      consumePeerRecord: jest.fn(async () => false),
    };

    await expect(consumeOrMatchSignedPeerRecord(peerStore, "peer", record)).resolves.toBe(true);
    expect(peerStore.consumePeerRecord).not.toHaveBeenCalled();
  });

  it("delegates a changed record to the peer store for verification", async () => {
    const peerStore = {
      get: jest.fn(async () => ({ peerRecordEnvelope: Uint8Array.of(1) })),
      consumePeerRecord: jest.fn(async () => true),
    };
    const peerId = { toString: () => "peer" };
    const record = Uint8Array.of(2);

    await expect(consumeOrMatchSignedPeerRecord(peerStore, peerId, record)).resolves.toBe(true);
    expect(peerStore.consumePeerRecord).toHaveBeenCalledWith(record, peerId);
  });
});
