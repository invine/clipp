import {
  MEMBERSHIP_PROTOCOL,
  createMembershipReconciler,
  decodeMembershipFrame,
  encodeMembershipFrame,
  type MembershipReconciliationIdentity,
} from "../../../packages/core/membership/reconciliation";

const alice = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
const bob = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
const charlie = "12D3KooWSuG4bhX3bg3oS1P2eS6NWRmArz98sQ5ALbqK2ABu54mF";

function identity(peerId: string, admitted = [peerId]): MembershipReconciliationIdentity {
  let view = { admittedPeerIds: admitted, revokedPeerIds: [] as string[] };
  let deviceName = peerId === alice ? "Desktop" : "Mobile";
  let revision = 0n;
  return {
    get: async () => ({ deviceId: peerId, deviceName, nameRevision: Number(revision) }),
    membershipView: async () => structuredClone(view),
    membershipStatus: async (candidate) => view.revokedPeerIds.includes(candidate) ? "revoked" : view.admittedPeerIds.includes(candidate) ? "active" : "unknown",
    mergeMembershipView: async (incoming) => {
      const next = {
        admittedPeerIds: [...new Set([...view.admittedPeerIds, ...incoming.admittedPeerIds])].sort(),
        revokedPeerIds: [...new Set([...view.revokedPeerIds, ...incoming.revokedPeerIds])].sort(),
      };
      next.admittedPeerIds = next.admittedPeerIds.filter((id) => !next.revokedPeerIds.includes(id));
      const changed = JSON.stringify(next) !== JSON.stringify(view);
      view = next;
      return changed;
    },
    recordRemoteDeviceName: async () => undefined,
  };
}

function network() {
  const handlers = new Map<string, (from: string, frame: Uint8Array) => void>();
  const sent: Array<{ from: string; to: string; protocol: string; frame: Uint8Array }> = [];
  const endpoints = new Map<string, ReturnType<typeof endpoint>>();
  function endpoint(peerId: string) {
    return {
      send: async (protocol: string, target: string, frame: Uint8Array) => {
        sent.push({ from: peerId, to: target, protocol, frame });
        handlers.get(`${target}:${protocol}`)?.(peerId, frame);
      },
      onMessage: (protocol: string, handler: (from: string, frame: Uint8Array) => void) => {
        handlers.set(`${peerId}:${protocol}`, handler);
      },
      onPeerConnected: () => undefined,
      connected: () => [alice, bob, charlie].filter((id) => id !== peerId),
    };
  }
  return { endpoint, sent };
}

describe("Membership Reconciliation", () => {
  it("encodes one bounded protobuf Membership View with canonical Peer ID sets", () => {
    const frame = encodeMembershipFrame({
      admittedPeerIds: [bob, alice],
      revokedPeerIds: [charlie],
      senderDeviceName: "Desktop",
      senderNameRevision: 3n,
    });

    expect(decodeMembershipFrame(frame)).toEqual({
      admittedPeerIds: [bob, alice],
      revokedPeerIds: [charlie],
      senderDeviceName: "Desktop",
      senderNameRevision: 3n,
      signedPeerRecords: [],
    });
  });

  it("ignores unknown fields and invalid presentation without blocking a valid Membership View", () => {
    const frame = encodeMembershipFrame({
      admittedPeerIds: [alice], revokedPeerIds: [], senderDeviceName: "Desktop", senderNameRevision: 1n,
    });
    const name = new TextEncoder().encode("Desktop");
    const offset = frame.findIndex((_, index) => name.every((byte, nameIndex) => frame[index + nameIndex] === byte));
    frame.set(Uint8Array.of(1, 2, 3, 4, 5, 6, 7), offset);
    frame[0] += 2;
    const extended = new Uint8Array([...frame, 0x30, 0x01]);

    expect(decodeMembershipFrame(extended)).toMatchObject({
      admittedPeerIds: [alice], senderDeviceName: "", senderNameRevision: 1n,
    });
  });

  it("merges separate Device Networks remove-wins and does not propagate a replay", async () => {
    const wired = network();
    const aliceIdentity = identity(alice, [alice, bob]);
    const bobIdentity = identity(bob, [alice, bob, charlie]);
    await bobIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [charlie] });
    const aliceReconciler = createMembershipReconciler({
      transport: { ...wired.endpoint(alice), getConnectedPeers: () => [bob], start: async () => undefined, stop: async () => undefined, connect: async () => undefined, onPeerDisconnected: () => undefined, onSelfPeerUpdate: () => undefined },
      identity: aliceIdentity,
    });
    const bobReconciler = createMembershipReconciler({
      transport: { ...wired.endpoint(bob), getConnectedPeers: () => [alice], start: async () => undefined, stop: async () => undefined, connect: async () => undefined, onPeerDisconnected: () => undefined, onSelfPeerUpdate: () => undefined },
      identity: bobIdentity,
    });
    aliceReconciler.start();
    bobReconciler.start();

    await aliceReconciler.receive(bob, encodeMembershipFrame({ admittedPeerIds: [alice, bob, charlie], revokedPeerIds: [charlie], senderDeviceName: "Mobile", senderNameRevision: 0n }));
    await bobReconciler.receive(alice, encodeMembershipFrame({ admittedPeerIds: [alice, bob, charlie], revokedPeerIds: [charlie], senderDeviceName: "Desktop", senderNameRevision: 0n }));

    expect(await aliceIdentity.membershipView()).toEqual({ admittedPeerIds: [bob, alice], revokedPeerIds: [charlie] });
    expect(await bobIdentity.membershipView()).toEqual({ admittedPeerIds: [bob, alice], revokedPeerIds: [charlie] });
    const countAfterMerge = wired.sent.length;

    await aliceReconciler.push(bob);
    expect(wired.sent).toHaveLength(countAfterMerge + 1);
  });

  it("rejects a Membership View from a sender that is not Active before persistence", async () => {
    const wired = network();
    const aliceIdentity = identity(alice);
    const reconciler = createMembershipReconciler({
      transport: { ...wired.endpoint(alice), getConnectedPeers: () => [], start: async () => undefined, stop: async () => undefined, connect: async () => undefined, onPeerDisconnected: () => undefined, onSelfPeerUpdate: () => undefined },
      identity: aliceIdentity,
    });
    reconciler.start();

    await reconciler.receive(bob, encodeMembershipFrame({ admittedPeerIds: [alice, bob], revokedPeerIds: [], senderDeviceName: "Mobile", senderNameRevision: 0n }));

    expect(await aliceIdentity.membershipView()).toEqual({ admittedPeerIds: [alice], revokedPeerIds: [] });
    expect(wired.sent.filter((message) => message.protocol === MEMBERSHIP_PROTOCOL)).toEqual([]);
  });
});
