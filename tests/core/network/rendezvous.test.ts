jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

import { registerOnRendezvous } from "../../../packages/core/network/rendezvous";

describe("Clipp exact rendezvous protocol", () => {
  it("registers Signed Peer Records on the namespaced protocol", async () => {
    const response = new TextEncoder().encode(JSON.stringify({ ok: true }));
    const stream = {
      send: jest.fn(() => true),
      close: jest.fn(async () => {}),
      async *[Symbol.asyncIterator]() {
        yield response;
      },
    };
    const node = { dialProtocol: jest.fn(async () => stream) };

    await expect(
      registerOnRendezvous(node, "/p2p/relay", "clipp", Uint8Array.of(1, 2, 3))
    ).resolves.toBe(true);

    expect(node.dialProtocol).toHaveBeenCalledWith(
      expect.anything(),
      "/clipp/rendezvous/1.0.0",
      undefined
    );
  });
});
