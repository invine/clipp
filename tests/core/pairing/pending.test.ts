import { createKVPendingTrustRequestStore, createPendingTrustRequestCoordinator } from "../../../packages/core/pairing/pending";
import { encodePairingFrame, encodeTrustRequestEnvelope, encodeTrustRequestPayload } from "../../../packages/core/pairing/protocol";

const initiatorPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";

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
