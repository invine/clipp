import { createPairingSession as createCorePairingSession } from "../../../packages/core/pairing/session";
import { decodePairingFrame, decodeTrustRequestEnvelope, encodePairingFrame } from "../../../packages/core/pairing/protocol";

const localPeerId = "12D3KooWJ7cZsGHAw84d9JLU6V3bqm1SGUvDg68RTNWJyPCduyfv";
const targetPeerId = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";

function createPairingSession(
  options: Omit<Parameters<typeof createCorePairingSession>[0], "membership"> & {
    membership?: Parameters<typeof createCorePairingSession>[0]["membership"];
  }
) {
  const active = new Set<string>();
  return createCorePairingSession({
    membership: {
      membershipStatus: async (peerId) => active.has(peerId) ? "active" : "unknown",
      admit: async (peerId) => { active.add(peerId); return "admitted"; },
    },
    ...options,
  });
}

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

  it("persists initiator-side Admission after validating an accepted response", async () => {
    let sent!: Uint8Array;
    let status: "active" | "revoked" | "unknown" = "unknown";
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_target, frame) => { sent = frame; },
      sign: async () => new Uint8Array([7]),
      verify: async () => true,
      membership: {
        membershipStatus: async () => status,
        admit: async () => { status = "active"; return "admitted"; },
      },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
    });
    await session.request(targetPeerId);
    const request = decodePairingFrame(sent);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({ kind: "response", response: { decision: "accepted", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n } });

    await expect(session.receiveResponse(targetPeerId, response)).resolves.toBe("accepted");
    expect(status).toBe("active");
  });

  it("keeps one visible in-memory retry loop after Admission persistence fails", async () => {
    const sent: Uint8Array[] = [];
    const timers = new Map<number, () => void>();
    const errors: unknown[] = [];
    let timerId = 0;
    let admissionAttempts = 0;
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_target, frame) => { sent.push(frame); },
      sign: async () => new Uint8Array([7]),
      verify: async () => true,
      membership: {
        membershipStatus: async () => "unknown",
        admit: async () => { admissionAttempts += 1; throw new Error("storage_failed"); },
      },
      clock: {
        now: () => 1_000,
        setTimeout: (handler) => { timerId += 1; const id = timerId; timers.set(id, () => { timers.delete(id); handler(); }); return id; },
        clearTimeout: (id) => { timers.delete(id as number); },
      },
      retryInitialDelayMs: 10,
      retryMaximumDelayMs: 40,
      onErrorsChanged: (state) => { errors.push(state); },
    });
    await session.request(targetPeerId);
    const request = decodePairingFrame(sent[0]);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({ kind: "response", response: { decision: "accepted", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n } });

    await expect(session.receiveResponse(targetPeerId, response)).resolves.toBe("retrying");
    expect(admissionAttempts).toBe(1);
    expect(errors.at(-1)).toEqual([{ targetPeerId, code: "membership_persistence_failed" }]);
    expect(timers.size).toBe(1);

    [...timers.values()][0]();
    await new Promise((resolve) => setImmediate(resolve));
    expect(sent).toHaveLength(2);

    await session.stop();
    expect(timers.size).toBe(0);
    expect(errors.at(-1)).toEqual([]);
  });

  it("stops Admission retry when the target becomes revoked", async () => {
    const sent: Uint8Array[] = [];
    const timers = new Map<number, () => void>();
    const errors: unknown[] = [];
    let timerId = 0;
    let status: "revoked" | "unknown" = "unknown";
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_target, frame) => { sent.push(frame); },
      sign: async () => new Uint8Array([7]),
      verify: async () => true,
      membership: {
        membershipStatus: async () => status,
        admit: async () => { throw new Error("storage_failed"); },
      },
      clock: {
        now: () => 1_000,
        setTimeout: (handler) => { timerId += 1; const id = timerId; timers.set(id, () => { timers.delete(id); handler(); }); return id; },
        clearTimeout: (id) => { timers.delete(id as number); },
      },
      retryInitialDelayMs: 10,
      onErrorsChanged: (state) => { errors.push(state); },
    });
    await session.request(targetPeerId);
    const request = decodePairingFrame(sent[0]);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({ kind: "response", response: { decision: "accepted", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n } });
    await session.receiveResponse(targetPeerId, response);

    status = "revoked";
    [...timers.values()][0]();
    await new Promise((resolve) => setImmediate(resolve));

    expect(sent).toHaveLength(1);
    expect(errors.at(-1)).toEqual([]);
    expect(session.retrying(targetPeerId)).toBe(false);
  });

  it("caps exponential Admission retry backoff", async () => {
    const sent: Uint8Array[] = [];
    const scheduled = new Map<number, { delay: number; run: () => void }>();
    let timerId = 0;
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_target, frame) => { sent.push(frame); },
      sign: async () => new Uint8Array([7]),
      verify: async () => true,
      membership: { membershipStatus: async () => "unknown", admit: async () => { throw new Error("storage_failed"); } },
      clock: {
        now: () => 1_000,
        setTimeout: (handler, delay) => { timerId += 1; const id = timerId; scheduled.set(id, { delay, run: () => { scheduled.delete(id); handler(); } }); return id; },
        clearTimeout: (id) => { scheduled.delete(id as number); },
      },
      retryInitialDelayMs: 10,
      retryMaximumDelayMs: 20,
    });
    await session.request(targetPeerId);
    const request = decodePairingFrame(sent[0]);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({ kind: "response", response: { decision: "accepted", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n } });
    await session.receiveResponse(targetPeerId, response);

    const runRetry = async (delay: number) => {
      const retry = [...scheduled.values()].find((entry) => entry.delay === delay);
      if (!retry) throw new Error(`missing_retry_${delay}`);
      retry.run();
      await new Promise((resolve) => setImmediate(resolve));
    };
    await runRetry(10);
    await runRetry(20);

    expect(sent).toHaveLength(3);
    expect([...scheduled.values()].some((entry) => entry.delay === 20)).toBe(true);
    await session.stop();
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

  it("rejects a validly signed rejected response from a revoked target", async () => {
    let sent!: Uint8Array;
    const diagnostics: any[] = [];
    const session = createPairingSession({
      identity: async () => ({ peerId: localPeerId, deviceName: "Desktop", nameRevision: 0 }),
      send: async (_target, frame) => { sent = frame; },
      sign: async () => new Uint8Array([7]),
      verify: async () => true,
      membership: {
        membershipStatus: async () => "revoked",
        admit: async () => "revoked",
      },
      clock: { now: () => 1_000, setTimeout: () => 1, clearTimeout: () => undefined },
      onRejected: (diagnostic) => void diagnostics.push(diagnostic),
    });
    await session.request(targetPeerId);
    const request = decodePairingFrame(sent);
    if (!request || request.kind !== "request") throw new Error("missing_request");
    const response = encodePairingFrame({ kind: "response", response: { decision: "rejected", requestEnvelope: request.envelope, responderDeviceName: "Mobile", responderNameRevision: 1n } });

    await expect(session.receiveResponse(targetPeerId, response)).resolves.toBeNull();
    expect(diagnostics.at(-1)).toMatchObject({ reason: "revoked_peer", authenticatedPeerId: targetPeerId });
    expect(session.waiting()).toHaveLength(1);
  });
});
