import {
  MEMBERSHIP_PROTOCOL,
  createMembershipReconciler,
  decodeMembershipFrame,
  encodeMembershipFrame,
  type MembershipReconciliationIdentity,
} from "../../../packages/core/membership/reconciliation";
import { peerIdToMultihashBytes } from "../../../packages/core/pairing/protocol";
import type { MessagingTransport } from "../../../packages/core/messaging/transport";

const alice = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
const bob = "12D3KooWFNjtBxwwk1dbR9eAcDX11U9TsiU3Xho3fuY3e25tQzdy";
const charlie = "12D3KooWSuG4bhX3bg3oS1P2eS6NWRmArz98sQ5ALbqK2ABu54mF";

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function protobufVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  do {
    const next = value & 0x7f;
    value >>>= 7;
    bytes.push(value > 0 ? next | 0x80 : next);
  } while (value > 0);
  return Uint8Array.from(bytes);
}

function protobufBytesField(field: number, value: Uint8Array): Uint8Array {
  return concatBytes([protobufVarint((field << 3) | 2), protobufVarint(value.length), value]);
}

function protobufVarintField(field: number, value: number): Uint8Array {
  return concatBytes([protobufVarint(field << 3), protobufVarint(value)]);
}

function membershipFrame(fields: Uint8Array[]): Uint8Array {
  const payload = concatBytes(fields);
  return concatBytes([protobufVarint(payload.length), payload]);
}

async function settleAsyncWork(): Promise<void> {
  for (let index = 0; index < 25; index += 1) await Promise.resolve();
}

function identity(peerId: string, admitted = [peerId]): MembershipReconciliationIdentity {
  let view = { admittedPeerIds: admitted, revokedPeerIds: [] as string[] };
  let deviceName = peerId === alice ? "Desktop" : "Mobile";
  let revision = 0n;
  const membershipListeners = new Set<() => void>();
  return {
    get: async () => ({ deviceId: peerId, deviceName, nameRevision: Number(revision) }),
    membershipView: async () => structuredClone(view),
    membershipStatus: async (candidate) => view.revokedPeerIds.includes(candidate) ? "revoked" : view.admittedPeerIds.includes(candidate) ? "active" : "unknown",
    mergeMembershipView: async (incoming) => {
      const next = {
        admittedPeerIds: [...new Set([...view.admittedPeerIds, ...incoming.admittedPeerIds])].sort(),
        revokedPeerIds: [...new Set([...view.revokedPeerIds, ...incoming.revokedPeerIds])].sort(),
      };
      const changed = JSON.stringify(next) !== JSON.stringify(view);
      view = next;
      if (changed) membershipListeners.forEach((listener) => listener());
      return changed;
    },
    recordRemoteDeviceName: async () => undefined,
    onMembershipChanged: (listener) => {
      membershipListeners.add(listener);
      return () => membershipListeners.delete(listener);
    },
  };
}

function network() {
  const handlers = new Map<string, (from: string, frame: Uint8Array) => void>();
  const sent: Array<{ from: string; to: string; protocol: string; frame: Uint8Array }> = [];
  const forgotten: Array<{ from: string; peerId: string }> = [];
  const disconnected: Array<{ from: string; peerId: string }> = [];
  let pendingSendFailures = 0;
  let pendingForgetFailures = 0;
  const connected = new Map<string, Set<string>>();
  const connectedHandlers = new Map<string, Set<(peerId: string) => void>>();
  function endpoint(peerId: string): MessagingTransport {
    return {
      start: async () => undefined,
      stop: async () => undefined,
      connect: async () => undefined,
      disconnect: async (targetPeerId) => {
        disconnected.push({ from: peerId, peerId: targetPeerId });
      },
      forgetPeer: async (targetPeerId) => {
        if (pendingForgetFailures > 0) {
          pendingForgetFailures -= 1;
          throw new Error("forget_failed");
        }
        forgotten.push({ from: peerId, peerId: targetPeerId });
      },
      send: async (protocol: string, target: string, frame: Uint8Array) => {
        if (pendingSendFailures > 0) {
          pendingSendFailures -= 1;
          throw new Error("send_failed");
        }
        sent.push({ from: peerId, to: target, protocol, frame });
        handlers.get(`${target}:${protocol}`)?.(peerId, frame);
      },
      onMessage: (protocol: string, handler: (from: string, frame: Uint8Array) => void) => {
        handlers.set(`${peerId}:${protocol}`, handler);
      },
      onPeerConnected: (handler) => {
        const current = connectedHandlers.get(peerId) ?? new Set();
        current.add(handler);
        connectedHandlers.set(peerId, current);
      },
      onPeerDisconnected: () => undefined,
      onSelfPeerUpdate: () => undefined,
      getConnectedPeers: () => [...(connected.get(peerId) ?? [])],
    };
  }
  function setConnected(peerId: string, peers: string[]): void {
    connected.set(peerId, new Set(peers));
  }
  function connect(left: string, right: string): void {
    const leftPeers = connected.get(left) ?? new Set<string>();
    const rightPeers = connected.get(right) ?? new Set<string>();
    leftPeers.add(right);
    rightPeers.add(left);
    connected.set(left, leftPeers);
    connected.set(right, rightPeers);
    connectedHandlers.get(left)?.forEach((handler) => handler(right));
    connectedHandlers.get(right)?.forEach((handler) => handler(left));
  }
  return {
    endpoint,
    sent,
    forgotten,
    disconnected,
    setConnected,
    connect,
    failNextSend: () => { pendingSendFailures += 1; },
    failNextForget: () => { pendingForgetFailures += 1; },
  };
}

describe("Membership Reconciliation", () => {
  it("encodes one bounded protobuf Membership View with canonical Peer ID sets", () => {
    const frame = encodeMembershipFrame({
      admittedPeerIds: [bob, alice],
      revokedPeerIds: [charlie],
      senderPresentation: { deviceName: "Desktop", nameRevision: 3n },
    });

    expect(decodeMembershipFrame(frame)).toEqual({
      admittedPeerIds: [bob, alice],
      revokedPeerIds: [charlie],
      senderPresentation: { deviceName: "Desktop", nameRevision: 3n },
      signedPeerRecords: [],
    });
  });

  it("accepts a Membership View without optional sender presentation metadata", () => {
    const frame = membershipFrame([
      protobufBytesField(1, peerIdToMultihashBytes(alice)),
    ]);

    expect(decodeMembershipFrame(frame)).toEqual({
      admittedPeerIds: [alice],
      revokedPeerIds: [],
      signedPeerRecords: [],
    });
  });

  it("ignores a malformed Signed Peer Record without rejecting valid membership", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const presentation = concatBytes([
        protobufBytesField(1, new TextEncoder().encode("Desktop")),
        protobufVarintField(2, 4),
      ]);
      const frame = membershipFrame([
        protobufBytesField(1, peerIdToMultihashBytes(alice)),
        protobufBytesField(3, presentation),
        protobufBytesField(5, protobufBytesField(1, new Uint8Array())),
      ]);

      expect(decodeMembershipFrame(frame)).toEqual({
        admittedPeerIds: [alice],
        revokedPeerIds: [],
        senderPresentation: { deviceName: "Desktop", nameRevision: 4n },
        signedPeerRecords: [],
      });
      expect(warn).toHaveBeenCalledWith(
        "Membership Signed Peer Record ignored",
        { reason: "invalid_entry" },
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("logs a content-free warning when Signed Peer Record verification fails", async () => {
    const wired = network();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: identity(alice, [alice, bob, charlie]),
      importSignedPeerRecord: async () => { throw new Error("sensitive verification detail"); },
    });
    try {
      await expect(reconciler.receive(bob, encodeMembershipFrame({
        admittedPeerIds: [alice, bob, charlie],
        revokedPeerIds: [],
        signedPeerRecords: [{ peerId: charlie, envelope: Uint8Array.of(1, 2, 3) }],
      }))).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        "Membership Signed Peer Record ignored",
        { reason: "verification_failed", peerId: charlie },
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain("sensitive verification detail");
    } finally {
      warn.mockRestore();
    }
  });

  it("remembers a valid higher revision while ignoring malformed UTF-8 presentation", () => {
    const presentation = concatBytes([
      protobufBytesField(1, Uint8Array.of(0xc3, 0x28)),
      protobufVarintField(2, 5),
    ]);
    const frame = membershipFrame([
      protobufBytesField(1, peerIdToMultihashBytes(alice)),
      protobufBytesField(3, presentation),
    ]);

    expect(decodeMembershipFrame(frame)).toEqual({
      admittedPeerIds: [alice],
      revokedPeerIds: [],
      senderPresentation: { deviceName: "", nameRevision: 5n },
      signedPeerRecords: [],
    });
  });

  it("ignores unknown fields and invalid presentation without blocking a valid Membership View", () => {
    const frame = encodeMembershipFrame({
      admittedPeerIds: [alice], revokedPeerIds: [], senderPresentation: { deviceName: "Desktop", nameRevision: 1n },
    });
    const name = new TextEncoder().encode("Desktop");
    const offset = frame.findIndex((_, index) => name.every((byte, nameIndex) => frame[index + nameIndex] === byte));
    frame.set(Uint8Array.of(1, 2, 3, 4, 5, 6, 7), offset);
    frame[0] += 2;
    const extended = new Uint8Array([...frame, 0x30, 0x01]);

    expect(decodeMembershipFrame(extended)).toMatchObject({
      admittedPeerIds: [alice], senderPresentation: { deviceName: "", nameRevision: 1n },
    });
  });

  it("merges separate Device Networks remove-wins and does not propagate a replay", async () => {
    const wired = network();
    wired.setConnected(alice, [bob]);
    wired.setConnected(bob, [alice]);
    const aliceIdentity = identity(alice, [alice, bob]);
    const bobIdentity = identity(bob, [alice, bob, charlie]);
    await bobIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [charlie] });
    const aliceReconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });
    const bobReconciler = createMembershipReconciler({
      transport: wired.endpoint(bob),
      identity: bobIdentity,
    });
    aliceReconciler.start();
    bobReconciler.start();

    await aliceReconciler.receive(bob, encodeMembershipFrame({ admittedPeerIds: [alice, bob, charlie], revokedPeerIds: [charlie], senderPresentation: { deviceName: "Mobile", nameRevision: 0n } }));
    await bobReconciler.receive(alice, encodeMembershipFrame({ admittedPeerIds: [alice, bob, charlie], revokedPeerIds: [charlie], senderPresentation: { deviceName: "Desktop", nameRevision: 0n } }));

    expect(await aliceIdentity.membershipView()).toEqual({ admittedPeerIds: [bob, alice, charlie], revokedPeerIds: [charlie] });
    expect(await bobIdentity.membershipView()).toEqual({ admittedPeerIds: [bob, alice, charlie], revokedPeerIds: [charlie] });
    const countAfterMerge = wired.sent.length;

    await aliceReconciler.push(bob);
    expect(wired.sent).toHaveLength(countAfterMerge + 1);
  });

  it("propagates one reconciliation wave and terminates an idempotent replay", async () => {
    const wired = network();
    wired.setConnected(alice, [bob]);
    const aliceIdentity = identity(alice, [alice, bob]);
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });
    reconciler.start();
    await settleAsyncWork();
    wired.sent.splice(0);

    await reconciler.receive(bob, encodeMembershipFrame({
      admittedPeerIds: [alice, bob, charlie],
      revokedPeerIds: [],
      senderPresentation: { deviceName: "Mobile", nameRevision: 0n },
    }));

    expect(wired.sent.filter((message) => message.protocol === MEMBERSHIP_PROTOCOL)).toHaveLength(1);
    const replay = encodeMembershipFrame({
      admittedPeerIds: [alice, bob, charlie],
      revokedPeerIds: [],
      senderPresentation: { deviceName: "Mobile", nameRevision: 0n },
    });
    await reconciler.receive(bob, replay);
    expect(wired.sent.filter((message) => message.protocol === MEMBERSHIP_PROTOCOL)).toHaveLength(1);
  });

  it("converges three logical devices across two authenticated connections", async () => {
    const wired = network();
    const identities = {
      [alice]: identity(alice, [alice, bob]),
      [bob]: identity(bob, [alice, bob, charlie]),
      [charlie]: identity(charlie, [bob, charlie]),
    };
    const reconcilers = Object.fromEntries(Object.entries(identities).map(([peerId, deviceIdentity]) => [
      peerId,
      createMembershipReconciler({ transport: wired.endpoint(peerId), identity: deviceIdentity }),
    ])) as Record<string, ReturnType<typeof createMembershipReconciler>>;
    Object.values(reconcilers).forEach((reconciler) => reconciler.start());

    wired.connect(alice, bob);
    wired.connect(bob, charlie);
    await settleAsyncWork();

    const converged = { admittedPeerIds: [bob, alice, charlie], revokedPeerIds: [] };
    await expect(identities[alice].membershipView()).resolves.toEqual(converged);
    await expect(identities[bob].membershipView()).resolves.toEqual(converged);
    await expect(identities[charlie].membershipView()).resolves.toEqual(converged);
  });

  it("converges independently of Admission and revocation message order", async () => {
    const admission = encodeMembershipFrame({
      admittedPeerIds: [alice, bob, charlie],
      revokedPeerIds: [],
    });
    const revocation = encodeMembershipFrame({
      admittedPeerIds: [alice, bob],
      revokedPeerIds: [charlie],
    });
    const reconcileInOrder = async (frames: Uint8Array[]) => {
      const wired = network();
      const deviceIdentity = identity(alice, [alice, bob]);
      const reconciler = createMembershipReconciler({
        transport: wired.endpoint(alice),
        identity: deviceIdentity,
      });
      for (const frame of frames) await reconciler.receive(bob, frame);
      return deviceIdentity.membershipView();
    };

    const expected = {
      admittedPeerIds: [bob, alice, charlie],
      revokedPeerIds: [charlie],
    };
    await expect(reconcileInOrder([admission, revocation])).resolves.toEqual(expected);
    await expect(reconcileInOrder([revocation, admission])).resolves.toEqual(expected);
  });

  it("keeps both concurrent revocations when each authorized sender is revoked in flight", async () => {
    const wired = network();
    const persistedIdentity = identity(alice, [alice, bob, charlie]);
    let mergeArrivals = 0;
    let releaseMerges: (() => void) | undefined;
    const bothMergesArrived = new Promise<void>((resolve) => { releaseMerges = resolve; });
    const concurrentIdentity: MembershipReconciliationIdentity = {
      ...persistedIdentity,
      mergeMembershipView: async (view) => {
        mergeArrivals += 1;
        if (mergeArrivals === 2) releaseMerges?.();
        await bothMergesArrived;
        return persistedIdentity.mergeMembershipView(view);
      },
    };
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: concurrentIdentity,
    });

    await Promise.all([
      reconciler.receive(bob, encodeMembershipFrame({
        admittedPeerIds: [alice, bob, charlie],
        revokedPeerIds: [charlie],
      })),
      reconciler.receive(charlie, encodeMembershipFrame({
        admittedPeerIds: [alice, bob, charlie],
        revokedPeerIds: [bob],
      })),
    ]);

    await expect(persistedIdentity.membershipView()).resolves.toEqual({
      admittedPeerIds: [bob, alice, charlie],
      revokedPeerIds: [bob, charlie],
    });
  });

  it("does not accept reconciliation from mutually revoked peers", async () => {
    const wired = network();
    const aliceIdentity = identity(alice, [alice, bob]);
    const bobIdentity = identity(bob, [alice, bob]);
    await aliceIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [bob] });
    await bobIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [alice] });
    const aliceReconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });
    const bobReconciler = createMembershipReconciler({
      transport: wired.endpoint(bob),
      identity: bobIdentity,
    });
    aliceReconciler.start();
    bobReconciler.start();
    await settleAsyncWork();

    wired.connect(alice, bob);
    await settleAsyncWork();

    await expect(aliceIdentity.membershipView()).resolves.toEqual({
      admittedPeerIds: [bob, alice],
      revokedPeerIds: [bob],
    });
    await expect(bobIdentity.membershipView()).resolves.toEqual({
      admittedPeerIds: [bob, alice],
      revokedPeerIds: [alice],
    });
    expect(wired.disconnected).toEqual(expect.arrayContaining([
      { from: alice, peerId: bob },
      { from: bob, peerId: alice },
    ]));
  });

  it("repairs an offline recipient with the full revocation view on reconnection", async () => {
    const wired = network();
    const aliceIdentity = identity(alice, [alice, bob, charlie]);
    const bobIdentity = identity(bob, [alice, bob, charlie]);
    await aliceIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [charlie] });
    const aliceReconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });
    const bobReconciler = createMembershipReconciler({
      transport: wired.endpoint(bob),
      identity: bobIdentity,
    });
    aliceReconciler.start();
    bobReconciler.start();
    await settleAsyncWork();

    wired.connect(alice, bob);
    await settleAsyncWork();

    await expect(bobIdentity.membershipView()).resolves.toEqual({
      admittedPeerIds: [bob, alice, charlie],
      revokedPeerIds: [charlie],
    });
  });

  it("does not resurrect a revoked Peer ID from a stale complete view", async () => {
    const wired = network();
    const aliceIdentity = identity(alice, [alice, bob, charlie]);
    await aliceIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [charlie] });
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });

    await reconciler.receive(bob, encodeMembershipFrame({
      admittedPeerIds: [alice, bob, charlie],
      revokedPeerIds: [],
    }));

    await expect(aliceIdentity.membershipStatus(charlie)).resolves.toBe("revoked");
  });

  it("performs no message-derived side effects when membership persistence fails", async () => {
    const wired = network();
    wired.setConnected(alice, [bob]);
    const persistedIdentity = identity(alice, [alice, bob]);
    let presentationUpdates = 0;
    let publishedChanges = 0;
    const failingIdentity: MembershipReconciliationIdentity = {
      ...persistedIdentity,
      mergeMembershipView: async () => { throw new Error("storage_failed"); },
      recordRemoteDeviceName: async () => { presentationUpdates += 1; },
    };
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: failingIdentity,
      onChanged: () => { publishedChanges += 1; },
    });

    await expect(reconciler.receive(bob, encodeMembershipFrame({
      admittedPeerIds: [alice, bob, charlie],
      revokedPeerIds: [],
      senderPresentation: { deviceName: "Mobile", nameRevision: 1n },
    }))).rejects.toThrow("storage_failed");

    await expect(persistedIdentity.membershipView()).resolves.toEqual({
      admittedPeerIds: [alice, bob],
      revokedPeerIds: [],
    });
    expect(presentationUpdates).toBe(0);
    expect(publishedChanges).toBe(0);
    expect(wired.sent).toEqual([]);
  });

  it("repairs membership missed while an Active Member was offline when it reconnects", async () => {
    const wired = network();
    const aliceIdentity = identity(alice, [alice, bob, charlie]);
    const bobIdentity = identity(bob, [alice, bob]);
    const aliceReconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });
    const bobReconciler = createMembershipReconciler({
      transport: wired.endpoint(bob),
      identity: bobIdentity,
    });
    aliceReconciler.start();
    bobReconciler.start();
    await settleAsyncWork();
    expect(wired.sent).toEqual([]);

    wired.connect(alice, bob);
    await settleAsyncWork();

    await expect(bobIdentity.membershipView()).resolves.toEqual({
      admittedPeerIds: [bob, alice, charlie],
      revokedPeerIds: [],
    });
  });

  it("retries a failed Membership View send with exponential backoff while connected", async () => {
    jest.useFakeTimers();
    try {
      const wired = network();
      wired.setConnected(alice, [bob]);
      wired.failNextSend();
      const reconciler = createMembershipReconciler({
        transport: wired.endpoint(alice),
        identity: identity(alice, [alice, bob]),
        retryBaseMs: 10,
      });
      reconciler.start();
      await settleAsyncWork();
      expect(wired.sent).toEqual([]);

      await jest.advanceTimersByTimeAsync(10);
      await settleAsyncWork();
      expect(wired.sent.filter((message) => message.protocol === MEMBERSHIP_PROTOCOL)).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("sends the committed revocation view once before cleaning up a revoked connection", async () => {
    const wired = network();
    wired.setConnected(alice, [bob]);
    const aliceIdentity = identity(alice, [alice, bob]);
    const events: string[] = [];
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
      onPeerRevoked: async (peerId) => { events.push(`cleanup:${peerId}`); },
    });
    reconciler.start();
    await settleAsyncWork();
    wired.sent.length = 0;

    await aliceIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [bob] });
    await settleAsyncWork();

    const revocationMessages = wired.sent.filter((message) => message.to === bob && message.protocol === MEMBERSHIP_PROTOCOL);
    expect(revocationMessages).toHaveLength(1);
    expect(decodeMembershipFrame(revocationMessages[0].frame)).toMatchObject({ revokedPeerIds: [bob] });
    expect(events).toEqual([`cleanup:${bob}`]);
  });

  it("forgets revoked peer reachability even while the peer is offline", async () => {
    const wired = network();
    const aliceIdentity = identity(alice, [alice, bob]);
    await aliceIdentity.mergeMembershipView({
      admittedPeerIds: [alice, bob],
      revokedPeerIds: [bob],
    });
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });

    reconciler.start();
    await settleAsyncWork();

    expect(wired.forgotten).toEqual([{ from: alice, peerId: bob }]);
    expect(wired.disconnected).toEqual([]);
    expect(wired.sent).toEqual([]);
  });

  it("retries failed revoked-peer cleanup while the peer remains offline", async () => {
    jest.useFakeTimers();
    try {
      const wired = network();
      wired.failNextForget();
      const aliceIdentity = identity(alice, [alice, bob]);
      await aliceIdentity.mergeMembershipView({
        admittedPeerIds: [alice, bob],
        revokedPeerIds: [bob],
      });
      const reconciler = createMembershipReconciler({
        transport: wired.endpoint(alice),
        identity: aliceIdentity,
        retryBaseMs: 10,
      });

      reconciler.start();
      await settleAsyncWork();
      expect(wired.forgotten).toEqual([]);

      await jest.advanceTimersByTimeAsync(10);
      await settleAsyncWork();
      expect(wired.forgotten).toEqual([{ from: alice, peerId: bob }]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("closes a revoked connection even when reachability cleanup fails", async () => {
    const wired = network();
    wired.setConnected(alice, [bob]);
    wired.failNextForget();
    const aliceIdentity = identity(alice, [alice, bob]);
    await aliceIdentity.mergeMembershipView({ admittedPeerIds: [], revokedPeerIds: [bob] });
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });

    reconciler.start();
    await settleAsyncWork();

    expect(wired.disconnected).toEqual([{ from: alice, peerId: bob }]);
  });

  it("finishes the triggering merge before stopping a locally revoked identity", async () => {
    const wired = network();
    wired.setConnected(alice, [bob]);
    const aliceIdentity = identity(alice, [alice, bob]);
    const localRevocations: string[] = [];
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
      onLocalRevoked: async () => { localRevocations.push("stopped"); },
    });
    reconciler.start();
    await settleAsyncWork();

    await reconciler.receive(bob, encodeMembershipFrame({
      admittedPeerIds: [alice, bob],
      revokedPeerIds: [alice],
    }));

    await expect(aliceIdentity.membershipStatus(alice)).resolves.toBe("revoked");
    expect(localRevocations).toEqual(["stopped"]);
  });

  it("enforces a persisted local revocation before sending on startup", async () => {
    const wired = network();
    wired.setConnected(alice, [bob]);
    const aliceIdentity = identity(alice, [alice, bob]);
    await aliceIdentity.mergeMembershipView({
      admittedPeerIds: [alice, bob],
      revokedPeerIds: [alice],
    });
    const localRevocations: string[] = [];
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
      onLocalRevoked: async () => { localRevocations.push("stopped"); },
    });

    reconciler.start();
    await settleAsyncWork();
    await reconciler.push(bob);

    expect(localRevocations).toEqual(["stopped"]);
    expect(wired.sent).toEqual([]);
  });

  it("rejects a Membership View from a sender that is not Active before persistence", async () => {
    const wired = network();
    const aliceIdentity = identity(alice);
    const reconciler = createMembershipReconciler({
      transport: wired.endpoint(alice),
      identity: aliceIdentity,
    });
    reconciler.start();

    await reconciler.receive(bob, encodeMembershipFrame({ admittedPeerIds: [alice, bob], revokedPeerIds: [], senderPresentation: { deviceName: "Mobile", nameRevision: 0n } }));

    expect(await aliceIdentity.membershipView()).toEqual({ admittedPeerIds: [alice], revokedPeerIds: [] });
    expect(wired.sent.filter((message) => message.protocol === MEMBERSHIP_PROTOCOL)).toEqual([]);
  });
});
