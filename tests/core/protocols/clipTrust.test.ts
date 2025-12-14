function sumBytes(data: Uint8Array): number {
  let sum = 0;
  for (const b of data) sum = (sum + b) & 0xff;
  return sum;
}

const fakePrivateKey = {
  sign(data: Uint8Array) {
    return new Uint8Array([sumBytes(data)]);
  },
};

const fakePublicKey = {
  verify(data: Uint8Array, sig: Uint8Array) {
    return sig.length === 1 && sig[0] === sumBytes(data);
  },
};

let clipTrust: any;

beforeAll(async () => {
  clipTrust = await import("../../../packages/core/protocols/clipTrust");
});

describe("clipTrust signatures", () => {
  it("signs and verifies trust requests", async () => {
    const { createSignedTrustRequestFromKey, verifyTrustRequestSignatureWithPublicKey } = clipTrust;
    const payload = {
      deviceId: "peerA",
      deviceName: "A",
      publicKey: "pk",
      multiaddr: "/p2p/peerA",
      multiaddrs: ["/p2p/peerA"],
      createdAt: 1,
    };

    const req = await createSignedTrustRequestFromKey({
      from: "peerA",
      to: "peerB",
      payload,
      privateKey: fakePrivateKey,
      now: () => 123,
    });
    expect(req.from).toBe("peerA");
    expect(req.to).toBe("peerB");
    expect((req.payload as any).privateKey).toBeUndefined();
    expect(await verifyTrustRequestSignatureWithPublicKey(req, fakePublicKey as any)).toBe(true);
  });

  it("fails verification when request is tampered", async () => {
    const { createSignedTrustRequestFromKey, verifyTrustRequestSignatureWithPublicKey } = clipTrust;
    const payload = {
      deviceId: "peerA",
      deviceName: "A",
      publicKey: "pk",
      multiaddr: "/p2p/peerA",
      multiaddrs: ["/p2p/peerA"],
      createdAt: 1,
    };
    const req = await createSignedTrustRequestFromKey({
      from: "peerA",
      to: "peerB",
      payload,
      privateKey: fakePrivateKey,
      now: () => 123,
    });
    expect(await verifyTrustRequestSignatureWithPublicKey({ ...req, to: "peerC" }, fakePublicKey as any)).toBe(false);
    expect(await verifyTrustRequestSignatureWithPublicKey({ ...req, sig: req.sig.slice(0, -2) + "aa" }, fakePublicKey as any)).toBe(false);
  });
});
