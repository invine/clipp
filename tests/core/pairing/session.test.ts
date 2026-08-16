import { createPairingSession } from "../../../packages/core/pairing/session";
import { decodePairingFrame, decodeTrustRequestEnvelope, encodePairingFrame } from "../../../packages/core/pairing/protocol";

const localPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";

describe("Pairing session", () => {
  it("sends a fresh signed request and replaces only that target's waiting deadline", async () => {
    const sent: Uint8Array[] = [];
    const timers = new Map<number, () => void>();
    const states: unknown[] = [];
    let timerId = 0;
    let now = 1_000;
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 4 }),
      send: async (_target, frame) => void sent.push(frame),
      sign: async (bytes) => Uint8Array.from([bytes.length]),
      verify: async () => true,
      clock: { now: () => now, setTimeout: (handler) => { timerId += 1; timers.set(timerId, handler); return timerId; }, clearTimeout: (id) => void timers.delete(id as number) },
      onWaitingChanged: (state) => void states.push(state),
      validityWindowMs: 10,
      clockSkewAllowanceMs: 2,
    });

    await session.request(targetPeerId);
    now = 1_001;
    await session.request(targetPeerId);

    expect(sent).toHaveLength(2);
    expect(session.waiting()).toEqual([{ targetPeerId, expiresAtUnixMs: 1_013n }]);
    expect(timers.size).toBe(1);
    expect(states).toHaveLength(2);
  });

  it("verifies an echoed request exactly once before clearing the waiting target", async () => {
    let sent!: Uint8Array;
    let verified!: Uint8Array;
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_target, frame) => { sent = frame; },
      sign: async () => new Uint8Array([7]),
      verify: async (bytes) => { verified = bytes; return true; },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
    });
    await session.request(targetPeerId);
    const request = decodePairingFrame(sent);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const envelope = decodeTrustRequestEnvelope(request.envelope);
    if (!envelope) throw new Error("missing_envelope");
    const response = encodePairingFrame({ kind: "response", response: { decision: "accepted", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n } });

    await expect(session.receiveResponse(targetPeerId, response)).resolves.toBe("accepted");
    expect(verified).toEqual(envelope.signedPayload);
    expect(session.waiting()).toEqual([]);
  });

  it("reports a structured rejection for an invalid response", async () => {
    let sent!: Uint8Array;
    const diagnostics: any[] = [];
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_target, frame) => { sent = frame; },
      sign: async () => new Uint8Array([7]),
      verify: async () => false,
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      connectionPath: () => "relayed",
      onRejected: (diagnostic) => void diagnostics.push(diagnostic),
    });
    await session.request(targetPeerId);
    const request = decodePairingFrame(sent);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({ kind: "response", response: { decision: "accepted", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n } });
    await expect(session.receiveResponse(targetPeerId, response)).resolves.toBeNull();
    expect(diagnostics[0]).toMatchObject({ event: "pairing_message_rejected", reason: "invalid_signature", authenticatedPeerId: targetPeerId, messageType: "response", connectionPath: "relayed" });
    expect(session.waiting()).toHaveLength(1);
  });
});
