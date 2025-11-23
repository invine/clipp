import { encodePairing } from "../../../packages/core/pairing/encode";
import { decodePairing } from "../../../packages/core/pairing/decode";

const base = {
  deviceId: "dev-1",
  deviceName: "Laptop",
  publicKey: "pk",
  multiaddrs: ["/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/p2p/dev-1"],
};

describe("pairing encode/decode", () => {
  const now = 1_700_000_000;
  let spy: jest.SpyInstance;

  beforeAll(() => {
    spy = jest.spyOn(Date, "now").mockReturnValue(now * 1000);
  });
  afterAll(() => spy.mockRestore());

  it("round trips payload", () => {
    const encoded = encodePairing(base);
    const decoded = decodePairing(encoded);
    expect(decoded).toEqual({ ...base, timestamp: now, version: "1" });
  });

  it("rejects expired payload", () => {
    const encoded = encodePairing(base);
    spy.mockReturnValue((now + 301) * 1000);
    expect(decodePairing(encoded)).toBeNull();
  });
});
