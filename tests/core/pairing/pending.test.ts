import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from "../../../packages/core/pairing/pending";
import { decodePairingFrame, encodePairingFrame, encodeTrustRequestEnvelope, encodeTrustRequestPayload } from "../../../packages/core/pairing/protocol";

const initiatorPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
const otherInitiatorPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

describe("pending Trust Requests", () => {
  it("serializes pending records without losing byte or bigint fields", async () => {
    let value: unknown;
    const store = createKVPendingTrustRequestStore({
      storage: { get: async () => value as any, set: async (_key, next) => { value = next; }, remove: async () => undefined },
      key: "pairing-pending",
    });
    await store.save({ initiatorPeerId, deviceName: "Mobile", nameRevision: 3n, requestEnvelope: new Uint8Array([1, 2]), expiresAtUnixMs: 100n });
    await expect(store.list()).resolves.toEqual([{ initiatorPeerId, deviceName: "Mobile", nameRevision: 3n, requestEnvelope: new Uint8Array([1, 2]), expiresAtUnixMs: 100n }]);
  });

  it("persists the original request and coalesces retries without another notification", async () => {
    const requests = new Map<string, any>();
    const shown: string[] = [];
    let now = 1_000;
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [...requests.values()], save: async (request) => void requests.set(request.initiatorPeerId, request), remove: async (id) => void requests.delete(id) },
      notifications: { show: async (notice) => void shown.push(notice.id), dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => now, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => true,
    });
    const frame = (issuedAt: bigint) => encodePairingFrame({ kind: "request" as const, envelope: encodeTrustRequestEnvelope({ signedPayload: encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 2n, issuedAtUnixMs: issuedAt }), signature: new Uint8Array([1]) }) });

    expect(await coordinator.receive(initiatorPeerId, frame(1_000n))).toBe(true);
    now = 1_100;
    expect(await coordinator.receive(initiatorPeerId, frame(1_100n))).toBe(true);

    expect(shown).toEqual([`pairing-request-${initiatorPeerId}`]);
    expect(requests.get(initiatorPeerId).expiresAtUnixMs).toBe(721_100n);
  });

  it("keeps the newest coalesced request when an older valid request is replayed", async () => {
    const requests = new Map<string, any>();
    let now = 1_100;
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [...requests.values()], save: async (request) => void requests.set(request.initiatorPeerId, request), remove: async () => undefined },
      notifications: { show: async () => undefined, dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => now, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => true,
    });
    const frame = (issuedAt: bigint) => encodePairingFrame({ kind: "request" as const, envelope: encodeTrustRequestEnvelope({ signedPayload: encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 2n, issuedAtUnixMs: issuedAt }), signature: new Uint8Array([1]) }) });
    const newest = frame(1_100n);

    expect(await coordinator.receive(initiatorPeerId, newest)).toBe(true);
    now = 1_150;
    expect(await coordinator.receive(initiatorPeerId, frame(1_050n))).toBe(true);

    const newestEnvelope = decodePairingFrame(newest);
    expect(newestEnvelope?.kind).toBe("request");
    expect(requests.get(initiatorPeerId)).toMatchObject({
      requestEnvelope: newestEnvelope?.kind === "request" ? newestEnvelope.envelope : undefined,
      expiresAtUnixMs: 721_100n,
    });
  });

  it("coalesces concurrent requests atomically per initiator", async () => {
    const requests = new Map<string, any>();
    const shown: string[] = [];
    let releaseOlderSave!: () => void;
    let markOlderSaveStarted!: () => void;
    const olderSaveStarted = new Promise<void>((resolve) => { markOlderSaveStarted = resolve; });
    const olderSaveGate = new Promise<void>((resolve) => { releaseOlderSave = resolve; });
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: {
        list: async () => [...requests.values()],
        save: async (request) => {
          if (request.expiresAtUnixMs === 721_000n) {
            markOlderSaveStarted();
            await olderSaveGate;
          }
          requests.set(request.initiatorPeerId, request);
        },
        remove: async () => undefined,
      },
      notifications: { show: async (notice) => void shown.push(notice.id), dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 1_100, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => true,
    });
    const frame = (issuedAt: bigint) => encodePairingFrame({ kind: "request" as const, envelope: encodeTrustRequestEnvelope({ signedPayload: encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 2n, issuedAtUnixMs: issuedAt }), signature: new Uint8Array([1]) }) });

    const older = coordinator.receive(initiatorPeerId, frame(1_000n));
    await olderSaveStarted;
    const newer = coordinator.receive(initiatorPeerId, frame(1_100n));
    await new Promise((resolve) => setImmediate(resolve));
    releaseOlderSave();
    await Promise.all([older, newer]);

    expect(requests.get(initiatorPeerId).expiresAtUnixMs).toBe(721_100n);
    expect(shown).toEqual([`pairing-request-${initiatorPeerId}`]);
  });

  it("keeps different initiators independently pending", async () => {
    const requests = new Map<string, any>();
    const shown: string[] = [];
    const dismissed: string[] = [];
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [...requests.values()], save: async (request) => void requests.set(request.initiatorPeerId, request), remove: async (id) => void requests.delete(id) },
      notifications: { show: async (notice) => void shown.push(notice.id), dismiss: async (id) => void dismissed.push(id), onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => true,
    });
    const frame = (peerId: string) => encodePairingFrame({ kind: "request" as const, envelope: encodeTrustRequestEnvelope({ signedPayload: encodeTrustRequestPayload({ initiatorPeerId: peerId, targetPeerId, deviceName: "Mobile", nameRevision: 2n, issuedAtUnixMs: 1_000n }), signature: new Uint8Array([1]) }) });

    await coordinator.receive(initiatorPeerId, frame(initiatorPeerId));
    await coordinator.receive(otherInitiatorPeerId, frame(otherInitiatorPeerId));
    await coordinator.expire(initiatorPeerId);

    expect([...requests.keys()]).toEqual([otherInitiatorPeerId]);
    expect(shown).toEqual([
      `pairing-request-${initiatorPeerId}`,
      `pairing-request-${otherInitiatorPeerId}`,
    ]);
    expect(dismissed).toEqual([`pairing-request-${initiatorPeerId}`]);
  });

  it("checks the envelope signature before attempting to parse a signed payload", async () => {
    let verifierCalled = false;
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [], save: async () => undefined, remove: async () => undefined },
      notifications: { show: async () => undefined, dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 0, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => { verifierCalled = true; return false; },
    });
    const frame = encodePairingFrame({ kind: "request", envelope: encodeTrustRequestEnvelope({ signedPayload: new Uint8Array([255]), signature: new Uint8Array([1]) }) });

    expect(await coordinator.receive(initiatorPeerId, frame)).toBe(false);
    expect(verifierCalled).toBe(true);
  });

  it("ignores invalid incoming name bytes and falls back to the shortened Peer ID", async () => {
    const requests = new Map<string, any>();
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [...requests.values()], save: async (request) => void requests.set(request.initiatorPeerId, request), remove: async () => undefined },
      notifications: { show: async () => undefined, dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => true,
    });
    const payload = encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 0n, issuedAtUnixMs: 1_000n });
    const nameOffset = payload.findIndex((byte, index) => byte === 0x4d && payload[index + 1] === 0x6f);
    payload[nameOffset] = 0xff;
    const frame = encodePairingFrame({ kind: "request", envelope: encodeTrustRequestEnvelope({ signedPayload: payload, signature: new Uint8Array([1]) }) });
    await expect(coordinator.receive(initiatorPeerId, frame)).resolves.toBe(true);
    expect(requests.get(initiatorPeerId).deviceName).toBe(`${initiatorPeerId.slice(0, 8)}…${initiatorPeerId.slice(-6)}`);
  });

  it("revalidates and sends one framed response when a request is decided", async () => {
    const requests = new Map<string, any>();
    const sent: Uint8Array[] = [];
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [...requests.values()], save: async (request) => void requests.set(request.initiatorPeerId, request), remove: async (id) => void requests.delete(id) },
      notifications: { show: async () => undefined, dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined }, clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => true, sendResponse: async (_peer, frame) => void sent.push(frame), responseIdentity: async () => ({ deviceName: "Desktop", nameRevision: 1n }),
    });
    const frame = encodePairingFrame({ kind: "request", envelope: encodeTrustRequestEnvelope({ signedPayload: encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 2n, issuedAtUnixMs: 1_000n }), signature: new Uint8Array([1]) }) });
    await coordinator.receive(initiatorPeerId, frame);
    await expect(coordinator.decide(initiatorPeerId, "accepted")).resolves.toBe(true);
    expect(sent).toHaveLength(1);
    expect(requests.size).toBe(0);
  });

  it("publishes removal when a durable approval expires", async () => {
    const requests = new Map<string, any>();
    let expiry!: () => void;
    const changes: number[] = [];
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [...requests.values()], save: async (request) => void requests.set(request.initiatorPeerId, request), remove: async (id) => void requests.delete(id) },
      notifications: { show: async () => undefined, dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 1_000, setTimeout: (handler) => { expiry = handler; return 1; }, clearTimeout: () => undefined },
      verify: async () => true,
      onChanged: (next) => void changes.push(next.length),
    });
    const frame = encodePairingFrame({ kind: "request", envelope: encodeTrustRequestEnvelope({ signedPayload: encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 0n, issuedAtUnixMs: 1_000n }), signature: new Uint8Array([1]) }) });
    await coordinator.receive(initiatorPeerId, frame);
    expiry();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(changes).toEqual([1, 0]);
  });

  it("removes a persisted request that fails full startup revalidation", async () => {
    const requests = new Map<string, any>();
    const store = {
      list: async () => [...requests.values()],
      save: async (request: any) => void requests.set(request.initiatorPeerId, request),
      remove: async (id: string) => void requests.delete(id),
    };
    const original = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store,
      notifications: { show: async () => undefined, dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => true,
    });
    const frame = encodePairingFrame({ kind: "request", envelope: encodeTrustRequestEnvelope({ signedPayload: encodeTrustRequestPayload({ initiatorPeerId, targetPeerId, deviceName: "Mobile", nameRevision: 1n, issuedAtUnixMs: 1_000n }), signature: new Uint8Array([1]) }) });
    await original.receive(initiatorPeerId, frame);
    const shown: string[] = [];
    const dismissed: string[] = [];
    const restored = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store,
      notifications: { show: async (notice) => void shown.push(notice.id), dismiss: async (id) => void dismissed.push(id), onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => false,
    });

    await restored.start();

    expect(requests.size).toBe(0);
    expect(shown).toEqual([]);
    expect(dismissed).toEqual([`pairing-request-${initiatorPeerId}`]);
  });

  it("rate-limits rejection diagnostics by authenticated peer and reason", async () => {
    const diagnostics: any[] = [];
    const coordinator = createPendingTrustRequestCoordinator({
      localPeerId: async () => targetPeerId,
      store: { list: async () => [], save: async () => undefined, remove: async () => undefined },
      notifications: { show: async () => undefined, dismiss: async () => undefined, onSelect: () => () => undefined },
      lifecycle: { openApprovalView: () => undefined },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      verify: async () => false,
      connectionPath: () => "direct",
      onRejected: (diagnostic) => void diagnostics.push(diagnostic),
    });
    const frame = encodePairingFrame({ kind: "request", envelope: encodeTrustRequestEnvelope({ signedPayload: new Uint8Array([1]), signature: new Uint8Array([1]) }) });
    await coordinator.receive(initiatorPeerId, frame);
    await coordinator.receive(initiatorPeerId, frame);
    await coordinator.receive(targetPeerId, frame);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ event: "pairing_message_rejected", reason: "invalid_signature", authenticatedPeerId: initiatorPeerId, connectionPath: "direct", suppressedCount: 0 });
  });
});
