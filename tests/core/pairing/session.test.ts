import { createPairingSession } from "../../../packages/core/pairing/session";

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
});
