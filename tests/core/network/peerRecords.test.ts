import {
  consumeOrMatchSignedPeerRecord,
  createKVSignedPeerRecordPersistence,
  verifiedSignedPeerRecordMultiaddrs,
} from "../../../packages/core/network/peerRecords";
import type { KVStorageBackend } from "../../../packages/core/trust";

const mockRecordMultiaddrs: string[] = [];
jest.mock(
  "@libp2p/peer-record",
  () => ({
    RecordEnvelope: {
      openAndCertify: jest.fn(async () => ({ payload: Uint8Array.of(1) })),
    },
    PeerRecord: {
      DOMAIN: "libp2p-peer-record",
      createFromProtobuf: () => ({
        peerId: { toString: () => "member-peer" },
        multiaddrs: mockRecordMultiaddrs.map((address) => ({
          toString: () => address,
        })),
      }),
    },
  }),
  { virtual: true }
);

describe("Signed Peer Record dial targets", () => {
  it("binds bare relay and WebRTC addresses to the verified Device Identity", async () => {
    mockRecordMultiaddrs.splice(
      0,
      mockRecordMultiaddrs.length,
      "/dns4/relay.example/tcp/443/wss/p2p/relay-peer/p2p-circuit",
      "/dns4/relay.example/tcp/443/wss/p2p/relay-peer/p2p-circuit/webrtc",
      "/ip4/192.0.2.1/tcp/1234/p2p/member-peer"
    );

    await expect(
      verifiedSignedPeerRecordMultiaddrs(Uint8Array.of(1), "member-peer")
    ).resolves.toEqual([
      "/dns4/relay.example/tcp/443/wss/p2p/relay-peer/p2p-circuit/p2p/member-peer",
      "/dns4/relay.example/tcp/443/wss/p2p/relay-peer/p2p-circuit/webrtc/p2p/member-peer",
      "/ip4/192.0.2.1/tcp/1234/p2p/member-peer",
    ]);
  });

  it("does not derive targets for another identity from a member's record", async () => {
    mockRecordMultiaddrs.splice(
      0,
      mockRecordMultiaddrs.length,
      "/ip4/192.0.2.1/tcp/1234/p2p/another-peer",
      "/ip4/192.0.2.1/tcp/5678"
    );

    await expect(
      verifiedSignedPeerRecordMultiaddrs(Uint8Array.of(1), "member-peer")
    ).resolves.toEqual(["/ip4/192.0.2.1/tcp/5678/p2p/member-peer"]);
    await expect(
      verifiedSignedPeerRecordMultiaddrs(Uint8Array.of(1), "another-peer")
    ).rejects.toThrow("signed_peer_record_subject_mismatch");
  });
});

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

  it("removes a revoked peer's cached reachability record without affecting other peers", async () => {
    const storage = new MemoryKVStorage();
    const records = createKVSignedPeerRecordPersistence({ storage });
    await records.save("revoked-peer", Uint8Array.of(1));
    await records.save("active-peer", Uint8Array.of(2));

    await records.remove("revoked-peer");

    expect(await records.load()).toEqual({ "active-peer": Uint8Array.of(2) });
  });

  it("accepts an already-consumed exact record as an idempotent refresh", async () => {
    const record = Uint8Array.of(1, 2, 3);
    const peerStore = {
      get: jest.fn(async () => ({
        peerRecordEnvelope: Uint8Array.from(record),
      })),
      consumePeerRecord: jest.fn(async () => false),
    };

    await expect(
      consumeOrMatchSignedPeerRecord(peerStore, "peer", record)
    ).resolves.toBe(true);
    expect(peerStore.consumePeerRecord).not.toHaveBeenCalled();
  });

  it("delegates a changed record to the peer store for verification", async () => {
    const peerStore = {
      get: jest.fn(async () => ({ peerRecordEnvelope: Uint8Array.of(1) })),
      consumePeerRecord: jest.fn(async () => true),
    };
    const peerId = { toString: () => "peer" };
    const record = Uint8Array.of(2);

    await expect(
      consumeOrMatchSignedPeerRecord(peerStore, peerId, record)
    ).resolves.toBe(true);
    expect(peerStore.consumePeerRecord).toHaveBeenCalledWith(record, peerId);
  });
});
