import { InMemoryHistoryBackend } from "../../../packages/core/history/types";
import type { DeviceIdentity } from "../../../packages/core/trust/identity";
import {
  createIdentityRotationCoordinator,
  createIdentityRotationCommitter,
} from "../../../packages/core/trust/identityRotation";
import {
  createKVIdentityRepository,
  type KVStorageBackend,
} from "../../../packages/core/trust/storage";

class Store implements KVStorageBackend {
  values = new Map<string, unknown>();
  unreadable = false;
  failSet?: string;
  loseSetReply?: string;
  failRemove?: string;

  async get<T>(key: string): Promise<T | undefined> {
    if (this.unreadable) throw new Error("read failed");
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    if (this.failSet === key) throw new Error("write failed");
    this.values.set(key, structuredClone(value));
    if (this.loseSetReply === key) {
      this.unreadable = true;
      throw new Error("reply lost");
    }
  }
  async remove(key: string): Promise<void> {
    if (this.failRemove === key) throw new Error("remove failed");
    this.values.delete(key);
  }
}

it("rejects a stale reviewed identity without preparing or deleting anything", async () => {
  const storage = new Store();
  const repository = createKVIdentityRepository({ storage, key: "identity" });
  await repository.upsert({
    deviceId: "current",
    privateKey: "private",
    publicKey: "public",
    deviceName: "Desktop",
    multiaddrs: [],
    createdAt: 1,
  });
  const generateKeyMaterial = jest.fn();
  const coordinator = createIdentityRotationCoordinator({
    repository,
    storage,
    initialDeviceName: "Desktop",
    shutdown: jest.fn(),
    generateKeyMaterial,
    retry: false,
    committer: {
      prepare: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      finalize: jest.fn(),
    },
    manualReset: {
      storage,
      acquireFence: jest.fn(),
      quiesce: jest.fn(),
      clearIdentityBoundData: jest.fn(),
      installIdentity: jest.fn(),
      verifyCleanup: jest.fn(),
    },
  });
  await expect(
    coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "stale",
    })
  ).resolves.toEqual({ outcome: "rejected", code: "stale_identity" });
  expect(generateKeyMaterial).not.toHaveBeenCalled();
});

async function setup() {
  const storage = new Store();
  const repository = createKVIdentityRepository({ storage, key: "identity" });
  const old = {
    deviceId: "old",
    privateKey: "old-private",
    publicKey: "old-public",
    deviceName: "Named",
    multiaddrs: [],
    createdAt: 1,
  };
  await repository.upsert(old);
  const effects: string[] = [];
  const ports = {
    storage,
    acquireFence: async () => {
      effects.push("fence");
      return {
        release: async () => {
          effects.push("release");
        },
      };
    },
    quiesce: async () => {
      effects.push("quiesce");
    },
    clearIdentityBoundData: async () => {
      effects.push("clear");
    },
    installIdentity: async (candidate: DeviceIdentity) => {
      effects.push("install");
      await repository.upsert(candidate);
    },
    verifyCleanup: async () => {
      effects.push("verify");
    },
  };
  const shutdown = jest.fn(async () => undefined);
  const generateKeyMaterial = jest.fn(async () => ({
    peerId: "new",
    publicKey: "new-public",
    privateKey: "new-private",
  }));
  const create = () =>
    createIdentityRotationCoordinator({
      repository,
      storage,
      manualReset: ports,
      initialDeviceName: "Desktop",
      now: () => 42,
      shutdown,
      generateKeyMaterial,
      deriveKeyMaterial: async (privateKey: string) => {
        if (privateKey === "old-private")
          return { peerId: "old", publicKey: "old-public", privateKey };
        if (privateKey === "new-private")
          return { peerId: "new", publicKey: "new-public", privateKey };
        if (privateKey === "later-private")
          return { peerId: "later", publicKey: "later-public", privateKey };
        throw new Error("invalid key");
      },
      committer: createIdentityRotationCommitter({
        repository,
        storage,
        history: new InMemoryHistoryBackend(),
      }),
      retry: false,
    });
  return {
    storage,
    repository,
    ports,
    effects,
    generateKeyMaterial,
    shutdown,
    create,
    coordinator: create(),
  };
}

it("durably accepts one candidate before cleanup and completes with a private-free receipt", async () => {
  const f = await setup();
  f.ports.clearIdentityBoundData = async () => {
    const accepted = await f.storage.get<{ candidate: { privateKey: string } }>(
      "manualIdentityReset"
    );
    expect(accepted?.candidate.privateKey).toBe("new-private");
    f.effects.push("clear");
  };
  const result = await f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  expect(result).toEqual({
    outcome: "completed",
    state: {
      phase: "completed",
      operationId: "operation-1",
      restartRequired: true,
      receipt: {
        receiptId: "operation-1",
        operationId: "operation-1",
        formerPeerId: "old",
        generatedPeerId: "new",
        completedAt: 42,
      },
      completedOperation: {
        operationId: "operation-1",
        generatedPeerId: "new",
      },
    },
  });
  expect(f.effects).toEqual(["fence", "quiesce", "clear", "install", "verify"]);
  expect(await f.storage.get("manualIdentityReset")).toBeUndefined();
  expect(await f.repository.get()).toMatchObject({
    deviceId: "new",
    deviceName: "Desktop",
    nameRevision: 0,
    membershipView: { admittedPeerIds: ["new"], revokedPeerIds: [] },
  });
});

it("fails closed on a candidate whose public identity does not derive from its private key", async () => {
  const f = await setup();
  await f.storage.set("manualIdentityReset", {
    version: 1,
    reason: "manual",
    operationId: "operation-1",
    formerPeerId: "old",
    phase: "cleaning",
    candidate: {
      deviceId: "impostor",
      privateKey: "new-private",
      publicKey: "new-public",
      deviceName: "Desktop",
      nameRevision: 0,
      multiaddrs: [],
      createdAt: 42,
      membershipView: { admittedPeerIds: ["impostor"], revokedPeerIds: [] },
    },
  });
  await expect(f.coordinator.reconcileIdentityReset()).resolves.toEqual({
    phase: "checking",
    error: "invalid_reset_state",
  });
  await expect(f.coordinator.recoverOrRotate()).resolves.toMatchObject({
    rotated: false,
    identity: undefined,
    recovery: { code: "manual_identity_reset_recovery" },
  });
  expect(f.effects).toEqual([]);
});

it("keeps accepted cleanup failure suspended and resumes the same candidate after restart", async () => {
  const f = await setup();
  f.ports.clearIdentityBoundData = async () => {
    throw new Error("private diagnostic must not escape");
  };
  const failed = await f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  expect(failed).toMatchObject({
    outcome: "accepted",
    state: {
      phase: "cleaning",
      operationId: "operation-1",
      error: "cleanup_failed",
    },
  });
  expect(JSON.stringify(failed)).not.toContain("private");
  expect(await f.repository.get()).toMatchObject({ deviceId: "old" });
  f.ports.clearIdentityBoundData = async () => {
    f.effects.push("clear");
  };
  await expect(
    f.create().resumeIdentityReset({ operationId: "operation-1" })
  ).resolves.toMatchObject({
    outcome: "completed",
    state: { receipt: { generatedPeerId: "new" } },
  });
  expect(f.generateKeyMaterial).toHaveBeenCalledTimes(1);
});

it("holds ambiguous acceptance until reconciliation and never generates another candidate", async () => {
  const f = await setup();
  f.storage.loseSetReply = "manualIdentityReset";
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({
    outcome: "outcome-unconfirmed",
    state: {
      phase: "checking",
      operationId: "operation-1",
      error: "storage_unavailable",
    },
  });
  expect(f.effects).toEqual(["fence"]);
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-2",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({ outcome: "outcome-unconfirmed" });
  f.storage.unreadable = false;
  f.storage.loseSetReply = undefined;
  await expect(f.coordinator.reconcileIdentityReset()).resolves.toEqual({
    phase: "accepted",
    operationId: "operation-1",
  });
  expect(f.effects).toEqual(["fence"]);
  await expect(
    f.coordinator.resumeIdentityReset({ operationId: "operation-1" })
  ).resolves.toMatchObject({ outcome: "completed" });
  expect(f.generateKeyMaterial).toHaveBeenCalledTimes(1);
});

it("releases the provisional fence only when storage proves start was not accepted", async () => {
  const f = await setup();
  f.storage.failSet = "manualIdentityReset";
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toEqual({ outcome: "rejected", code: "preparation_failed" });
  expect(f.effects).toEqual(["fence", "release"]);
  expect(await f.repository.get()).toMatchObject({ deviceId: "old" });
  await expect(f.coordinator.reconcileIdentityReset()).resolves.toEqual({
    phase: "idle",
  });
});

it("shuts down automatic revocation immediately during manual preparation and rejects the obsolete review", async () => {
  const f = await setup();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let prepared!: () => void;
  const preparing = new Promise<void>((resolve) => {
    prepared = resolve;
  });
  f.generateKeyMaterial.mockImplementationOnce(async () => {
    prepared();
    await waiting;
    return {
      peerId: "new",
      privateKey: "new-private",
      publicKey: "new-public",
    };
  });
  const manual = f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  await preparing;
  const automatic = f.coordinator.rotate("revoked");
  expect(f.shutdown).toHaveBeenCalledTimes(1);
  release();
  await expect(manual).resolves.toEqual({
    outcome: "rejected",
    code: "automatic_rotation_pending",
  });
  await automatic;
  expect(await f.storage.get("manualIdentityReset")).toBeUndefined();
  expect(f.effects).not.toContain("clear");
});

it("requires reminder dismissal, retains bounded replay after dismissal and never restarts a fresh process for a past reminder", async () => {
  const f = await setup();
  await f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  const fresh = f.create();
  await expect(fresh.reconcileIdentityReset()).resolves.toMatchObject({
    phase: "idle",
    receipt: { formerPeerId: "old" },
  });
  f.storage.unreadable = true;
  await expect(fresh.reconcileIdentityReset()).resolves.toMatchObject({
    phase: "checking",
  });
  f.storage.unreadable = false;
  await expect(fresh.reconcileIdentityReset()).resolves.toMatchObject({
    phase: "idle",
    acceptance: "not-accepted",
  });
  await expect(
    fresh.beginIdentityReset({
      operationId: "operation-2",
      reviewedPeerId: "new",
    })
  ).resolves.toEqual({ outcome: "rejected", code: "reminder_pending" });
  f.storage.failRemove = "manualIdentityResetReceipt";
  await expect(
    fresh.dismissIdentityResetReminder({ receiptId: "operation-1" })
  ).resolves.toMatchObject({
    phase: "idle",
    receipt: { receiptId: "operation-1" },
  });
  f.storage.failRemove = undefined;
  await fresh.dismissIdentityResetReminder({ receiptId: "stale" });
  expect((await fresh.reconcileIdentityReset()).phase).toBe("idle");
  expect(await f.storage.get("manualIdentityResetReceipt")).toBeDefined();
  await fresh.dismissIdentityResetReminder({ receiptId: "operation-1" });
  await expect(
    fresh.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({
    outcome: "completed",
    state: {
      completedOperation: {
        operationId: "operation-1",
        generatedPeerId: "new",
      },
    },
  });
  expect(f.generateKeyMaterial).toHaveBeenCalledTimes(1);
});

it.each([
  "manualIdentityResetReceipt",
  "manualIdentityResetCompleted",
  "journal-removal",
])(
  "keeps finalization incomplete at %s and rolls forward after reopening",
  async (failure) => {
    const f = await setup();
    if (failure === "journal-removal")
      f.storage.failRemove = "manualIdentityReset";
    else f.storage.failSet = failure;
    const failed = await f.coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    });
    expect(failed).toMatchObject({
      outcome: "accepted",
      state: { phase: "finalizing", operationId: "operation-1" },
    });
    expect(await f.storage.get("manualIdentityReset")).toBeDefined();
    await expect(f.create().recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      identity: undefined,
      recovery: { code: "manual_identity_reset_recovery" },
    });
    f.storage.failRemove = undefined;
    f.storage.failSet = undefined;
    await expect(
      f.create().resumeIdentityReset({ operationId: "operation-1" })
    ).resolves.toMatchObject({ outcome: "completed" });
    expect(f.generateKeyMaterial).toHaveBeenCalledTimes(1);
    expect(await f.storage.get("manualIdentityReset")).toBeUndefined();
  }
);

it("preserves the previous manual reminder across later automatic rotation and replays its original result", async () => {
  const f = await setup();
  await f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  const automatic = f.create();
  f.generateKeyMaterial.mockResolvedValue({
    peerId: "later",
    privateKey: "later-private",
    publicKey: "later-public",
  });
  await expect(automatic.rotate("revoked")).resolves.toMatchObject({
    rotated: true,
    identity: { deviceId: "later" },
  });
  await expect(automatic.reconcileIdentityReset()).resolves.toMatchObject({
    phase: "idle",
    receipt: { formerPeerId: "old", generatedPeerId: "new" },
  });
  await expect(
    automatic.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({
    outcome: "completed",
    state: { completedOperation: { generatedPeerId: "new" } },
  });
  expect(await f.repository.get()).toMatchObject({ deviceId: "later" });
});

it("requires observable journal sanitization and the installed validated candidate before completion", async () => {
  const f = await setup();
  const remove = f.storage.remove.bind(f.storage);
  f.storage.remove = async (key) => {
    if (key !== "manualIdentityReset") await remove(key);
  };
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({
    outcome: "accepted",
    state: { phase: "finalizing" },
  });
  f.storage.remove = remove;
  await f.repository.upsert({
    ...((await f.repository.get()) as DeviceIdentity),
    privateKey: "invalid",
  });
  await expect(
    f.coordinator.resumeIdentityReset({ operationId: "operation-1" })
  ).resolves.toMatchObject({
    outcome: "accepted",
    state: { phase: "finalizing", error: "cleanup_failed" },
  });
  expect(await f.storage.get("manualIdentityReset")).toBeDefined();
});

it("gives an already queued automatic transition precedence over a manual request", async () => {
  const f = await setup();
  const manual = f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  const automatic = f.coordinator.rotate("revoked");
  await expect(manual).resolves.toEqual({
    outcome: "rejected",
    code: "automatic_rotation_pending",
  });
  await automatic;
  expect(f.effects).toEqual([]);
});

it("keeps the accepted candidate when automatic revocation arrives during quiescence", async () => {
  const f = await setup();
  let automatic: ReturnType<typeof f.coordinator.rotate> | undefined;
  f.ports.quiesce = async () => {
    automatic = f.coordinator.rotate("revoked");
  };
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({
    outcome: "completed",
    state: { receipt: { generatedPeerId: "new" } },
  });
  await expect(automatic).resolves.toMatchObject({
    rotated: false,
    recovery: { code: "manual_identity_reset_recovery" },
  });
  expect(f.generateKeyMaterial).toHaveBeenCalledTimes(1);
});

it("does not let public observers change whether an intent was accepted", async () => {
  const f = await setup();
  f.coordinator.onStatusChanged(() => {
    throw new Error("observer failed");
  });
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({ outcome: "completed" });
  expect(f.effects).not.toContain("release");
});

it("releases unknown acceptance only after absence is proven, even with an older replay guard", async () => {
  const f = await setup();
  await f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  await f.coordinator.dismissIdentityResetReminder({
    receiptId: "operation-1",
  });
  const fresh = f.create();
  f.generateKeyMaterial.mockResolvedValue({
    peerId: "later",
    privateKey: "later-private",
    publicKey: "later-public",
  });
  const set = f.storage.set.bind(f.storage);
  f.storage.set = async (key, value) => {
    if (key === "manualIdentityReset") {
      f.storage.unreadable = true;
      throw new Error("unconfirmed");
    }
    await set(key, value);
  };
  await expect(
    fresh.beginIdentityReset({
      operationId: "operation-2",
      reviewedPeerId: "new",
    })
  ).resolves.toMatchObject({
    outcome: "outcome-unconfirmed",
    state: { operationId: "operation-2" },
  });
  expect(f.effects).not.toContain("release");
  f.storage.unreadable = false;
  f.storage.set = set;
  await expect(fresh.reconcileIdentityReset()).resolves.toMatchObject({
    phase: "idle",
    acceptance: "not-accepted",
    completedOperation: { operationId: "operation-1" },
  });
  expect(f.effects.filter((effect) => effect === "release")).toHaveLength(1);
  expect(await f.repository.get()).toMatchObject({ deviceId: "new" });
});

it("keeps the completed process sealed after reminder dismissal, and permits a new reset only in a fresh owner", async () => {
  const f = await setup();
  await f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  await f.coordinator.dismissIdentityResetReminder({
    receiptId: "operation-1",
  });
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-2",
      reviewedPeerId: "new",
    })
  ).resolves.toEqual({ outcome: "rejected", code: "unavailable" });
  f.generateKeyMaterial.mockResolvedValue({
    peerId: "later",
    privateKey: "later-private",
    publicKey: "later-public",
  });
  await expect(
    f
      .create()
      .beginIdentityReset({ operationId: "operation-2", reviewedPeerId: "new" })
  ).resolves.toMatchObject({
    outcome: "completed",
    state: { receipt: { formerPeerId: "new", generatedPeerId: "later" } },
  });
});

it.each([
  ["quiesce", "quiescing"],
  ["clearIdentityBoundData", "cleaning"],
  ["installIdentity", "installing"],
  ["verifyCleanup", "finalizing"],
] as const)(
  "rolls forward through a failure of %s without activating an incomplete identity",
  async (method, phase) => {
    const f = await setup();
    const restore = f.ports[method];
    f.ports[method] = async () => {
      throw new Error("backend failed");
    };
    await expect(
      f.coordinator.beginIdentityReset({
        operationId: "operation-1",
        reviewedPeerId: "old",
      })
    ).resolves.toMatchObject({
      outcome: "accepted",
      state: { phase, error: "cleanup_failed" },
    });
    await expect(f.create().recoverOrRotate()).resolves.toMatchObject({
      rotated: false,
      identity: undefined,
      recovery: { code: "manual_identity_reset_recovery" },
    });
    Object.assign(f.ports, { [method]: restore });
    await expect(
      f.create().resumeIdentityReset({ operationId: "operation-1" })
    ).resolves.toMatchObject({ outcome: "completed" });
    expect(f.generateKeyMaterial).toHaveBeenCalledTimes(1);
  }
);

it("reestablishes the admission fence before resuming an accepted operation in a fresh owner", async () => {
  const f = await setup();
  f.ports.clearIdentityBoundData = async () => {
    throw new Error("clear failed");
  };
  await f.coordinator.beginIdentityReset({
    operationId: "operation-1",
    reviewedPeerId: "old",
  });
  f.ports.acquireFence = async () => {
    throw new Error("fence unavailable");
  };
  f.ports.clearIdentityBoundData = async () => {
    f.effects.push("clear");
  };
  await expect(
    f.create().resumeIdentityReset({ operationId: "operation-1" })
  ).resolves.toMatchObject({
    outcome: "accepted",
    state: { phase: "cleaning", error: "cleanup_failed" },
  });
  expect(f.effects).not.toContain("clear");
});

it("retains the private recovery journal until both completion records are observable", async () => {
  const f = await setup();
  const set = f.storage.set.bind(f.storage);
  f.storage.set = async (key, value) => {
    if (key !== "manualIdentityResetCompleted") await set(key, value);
  };
  await expect(
    f.coordinator.beginIdentityReset({
      operationId: "operation-1",
      reviewedPeerId: "old",
    })
  ).resolves.toMatchObject({
    outcome: "accepted",
    state: { phase: "finalizing" },
  });
  expect(await f.storage.get("manualIdentityReset")).toBeDefined();
  f.storage.set = set;
  await expect(
    f.create().resumeIdentityReset({ operationId: "operation-1" })
  ).resolves.toMatchObject({ outcome: "completed" });
});
