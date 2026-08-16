
export type MembershipView = { admittedPeerIds: string[]; revokedPeerIds: string[] };

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  privateKey?: string;
  multiaddrs: string[];
  createdAt: number;
  nameRevision?: number;
  membershipView?: MembershipView;
}

/** The identity shape that may cross a runtime's public/UI boundary. */
export type PublicDeviceIdentity = Omit<DeviceIdentity, "privateKey">;

export function toPublicDeviceIdentity(identity: DeviceIdentity): PublicDeviceIdentity {
  const publicIdentity: Partial<DeviceIdentity> = { ...identity };
  delete publicIdentity.privateKey;
  return publicIdentity as PublicDeviceIdentity;
}

export interface IdentityRepository {
  get(): Promise<DeviceIdentity | undefined>;
  upsert(identity: DeviceIdentity): Promise<void>;
  loadInitializationError?(): Promise<IdentityInitializationError | undefined>;
  saveInitializationError?(error: IdentityInitializationError): Promise<void>;
  clearInitializationError?(): Promise<void>;
}

export interface IdentityManager {
  get(): Promise<DeviceIdentity>;
  retryInitialization(): Promise<DeviceIdentity>;
  rename(name: string): Promise<void>;
  updateMultiaddrs(multiaddrs: string[]): Promise<void>;
  membershipStatus(peerId: string): Promise<"active" | "revoked" | "unknown">;
  activePeerIds(): Promise<string[]>;
  admit(peerId: string): Promise<"admitted" | "already-active" | "revoked">;
  getInitializationError(): Promise<IdentityInitializationError | undefined>;
}

export type IdentityKeyMaterial = { peerId: string; privateKey: string; publicKey: string };
export type IdentityInitializationError = { code: "identity_initialization_failed" };

export function createIdentityManager(options: {
  repo: IdentityRepository;
  now?: () => number;
  initialDeviceName: string;
  generateKeyMaterial?: () => Promise<IdentityKeyMaterial>;
  deriveKeyMaterial?: (privateKey: string) => Promise<IdentityKeyMaterial>;
}): IdentityManager {
  const clock = options.now ?? Date.now;
  const initialDeviceName = options.initialDeviceName;
  const generateKeyMaterial = options.generateKeyMaterial ?? createLibp2pIdentity;
  const deriveKeyMaterial = options.deriveKeyMaterial ?? deriveFromPrivateKey;
  let identity: DeviceIdentity | undefined;
  let initialization: Promise<DeviceIdentity> | undefined;
  let mutation = Promise.resolve();

  function serializeMutation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = mutation.then(operation);
    mutation = result.then(() => undefined, () => undefined);
    return result;
  }

  async function persist(value: DeviceIdentity): Promise<DeviceIdentity> {
    await options.repo.upsert(value);
    await options.repo.clearInitializationError?.();
    identity = value;
    return value;
  }

  async function createNewIdentity(): Promise<DeviceIdentity> {
    const key = await generateKeyMaterial();
    return persist({
      deviceId: key.peerId,
      deviceName: initialDeviceName,
      nameRevision: 0,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      multiaddrs: [],
      createdAt: clock(),
      membershipView: { admittedPeerIds: [key.peerId], revokedPeerIds: [] },
    });
  }

  async function persistMutation(value: DeviceIdentity): Promise<DeviceIdentity> {
    await options.repo.upsert(value);
    identity = value;
    return value;
  }

  function loadIdentity(allowRetry = false): Promise<DeviceIdentity> {
    if (identity) return Promise.resolve(identity);
    if (!initialization) {
      initialization = (async () => {
        if (!allowRetry) {
          const initializationError = await options.repo.loadInitializationError?.();
          if (initializationError) throw new Error(initializationError.code);
        }
        try {
          return await loadIdentityOrThrow();
        } catch (error) {
          await options.repo.saveInitializationError?.({ code: "identity_initialization_failed" });
          throw error;
        }
      })()
        .finally(() => {
          initialization = undefined;
        });
    }
    return initialization;
  }

  async function loadIdentityOrThrow(): Promise<DeviceIdentity> {
    if (identity) return identity;
    const stored = await options.repo.get();
    if (!stored?.privateKey) return createNewIdentity();

    const key = await deriveKeyMaterial(stored.privateKey);
    const membershipView = completeMembershipView(key.peerId, stored.membershipView);
    const repaired: DeviceIdentity = {
      ...stored,
      deviceId: key.peerId,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      deviceName: stored.deviceName || initialDeviceName,
      nameRevision: stored.nameRevision ?? 0,
      multiaddrs: Array.isArray(stored.multiaddrs) ? stored.multiaddrs : [],
      membershipView,
    };
    const needsRepair =
      stored.deviceId !== repaired.deviceId ||
      stored.publicKey !== repaired.publicKey ||
      stored.nameRevision !== repaired.nameRevision ||
      !sameMembershipView(stored.membershipView, membershipView) ||
      !Array.isArray(stored.multiaddrs);
    if (needsRepair) return persist(repaired);
    await options.repo.clearInitializationError?.();
    identity = repaired;
    return repaired;
  }

  return {
    get: loadIdentity,
    retryInitialization: () => loadIdentity(true),
    rename: (name) => serializeMutation(async () => {
      const current = await loadIdentity();
      await persistMutation({ ...current, deviceName: name, nameRevision: (current.nameRevision ?? 0) + 1 });
    }),
    updateMultiaddrs: (multiaddrs) => serializeMutation(async () => {
      const current = await loadIdentity();
      await persistMutation({ ...current, multiaddrs: [...multiaddrs] });
    }),
    membershipStatus: async (peerId) => {
      await mutation;
      const current = await options.repo.get() ?? await loadIdentity();
      const view = completeMembershipView(current.deviceId, current.membershipView);
      if (view.revokedPeerIds.includes(peerId)) return "revoked";
      return view.admittedPeerIds.includes(peerId) ? "active" : "unknown";
    },
    activePeerIds: async () => {
      await mutation;
      const current = await options.repo.get() ?? await loadIdentity();
      const view = completeMembershipView(current.deviceId, current.membershipView);
      const revoked = new Set(view.revokedPeerIds);
      return view.admittedPeerIds.filter((peerId) => !revoked.has(peerId));
    },
    admit: (peerId) => serializeMutation(async () => {
      const current = await loadIdentity();
      const view = completeMembershipView(current.deviceId, current.membershipView);
      if (view.revokedPeerIds.includes(peerId)) return "revoked" as const;
      if (view.admittedPeerIds.includes(peerId)) return "already-active" as const;
      await persistMutation({
        ...current,
        membershipView: {
          admittedPeerIds: [...view.admittedPeerIds, peerId],
          revokedPeerIds: view.revokedPeerIds,
        },
      });
      return "admitted" as const;
    }),
    getInitializationError: async () => options.repo.loadInitializationError?.(),
  };
}

function completeMembershipView(peerId: string, membershipView?: MembershipView): MembershipView {
  const admittedPeerIds = [...new Set(membershipView?.admittedPeerIds ?? [peerId])];
  if (!admittedPeerIds.includes(peerId)) admittedPeerIds.push(peerId);
  return { admittedPeerIds, revokedPeerIds: [...new Set(membershipView?.revokedPeerIds ?? [])] };
}

function sameMembershipView(left: MembershipView | undefined, right: MembershipView): boolean {
  return (
    left?.admittedPeerIds.length === right.admittedPeerIds.length &&
    left?.revokedPeerIds.length === right.revokedPeerIds.length &&
    left.admittedPeerIds.every((peerId, index) => peerId === right.admittedPeerIds[index]) &&
    left.revokedPeerIds.every((peerId, index) => peerId === right.revokedPeerIds[index])
  );
}

async function createLibp2pIdentity(): Promise<IdentityKeyMaterial> {
  const { generateKeyPair, privateKeyToProtobuf } = await import("@libp2p/crypto/keys");
  const key = await generateKeyPair("Ed25519");
  const privateKey = Buffer.from(privateKeyToProtobuf(key)).toString("base64");
  return keyMaterialFromPrivateKey(key, privateKey);
}

async function deriveFromPrivateKey(privateKey: string): Promise<IdentityKeyMaterial> {
  const { privateKeyFromProtobuf } = await import("@libp2p/crypto/keys");
  const key = privateKeyFromProtobuf(Uint8Array.from(Buffer.from(privateKey, "base64")));
  return keyMaterialFromPrivateKey(key, privateKey);
}

async function keyMaterialFromPrivateKey(key: any, privateKey: string): Promise<IdentityKeyMaterial> {
  const { peerIdFromPrivateKey } = await import("@libp2p/peer-id");
  const publicKey = key.publicKey?.raw ?? key.publicKey?.bytes ?? key.publicKey?.marshal?.();
  if (!(publicKey instanceof Uint8Array)) throw new Error("identity_public_key_unavailable");
  return {
    peerId: peerIdFromPrivateKey(key).toString(),
    privateKey,
    publicKey: Buffer.from(publicKey).toString("base64"),
  };
}
