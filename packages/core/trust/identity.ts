// TODO: check if these imports are needed
import { deviceIdToPeerId, peerIdToString } from "../network/peerId.js";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  privateKey?: string;
  multiaddrs: string[];
  createdAt: number;
}

export interface IdentityRepository {
  get(): Promise<DeviceIdentity | undefined>
  upsert(identity: DeviceIdentity): Promise<void>
}

export interface IdentityManager {
  get(): Promise<DeviceIdentity>
  rename(name: string): Promise<void>
  updateMultiaddrs(multiaddrs: string[]): Promise<void>
}

export function createIdentityManager(options: {
  repo: IdentityRepository,
  now?: () => number
}): IdentityManager {
  const { repo } = options
  let identity: DeviceIdentity | undefined;
  const clock = options.now ?? Date.now;

  async function generateNewIdentity(): Promise<DeviceIdentity> {
    const libp2pIdentity = await createLibp2pIdentity()
    const identity: DeviceIdentity = {
      deviceId: libp2pIdentity.peerId,
      deviceName: libp2pIdentity.peerId,
      publicKey: libp2pIdentity.publicKey,
      privateKey: libp2pIdentity.privateKey,
      multiaddrs: [],
      createdAt: clock(),
    }
    repo.upsert(identity)
    return identity
  }

  async function getLocalIdentity(): Promise<DeviceIdentity> {
    if (!identity) {
      identity = await repo.get()
    }
    if (!identity?.privateKey) {
      identity = await generateNewIdentity()
    }
    if (!validateIdentity(identity)) {
      identity = await restoreFromPrivKey()
    }
    return identity
  }

  // TODO: implement
  function validateIdentity(identity: DeviceIdentity): boolean {
    if (!identity) return false
    return true
  }

  async function restoreFromPrivKey(): Promise<DeviceIdentity> {
    const current = await getLocalIdentity()
    if (!current.privateKey) return await generateNewIdentity();
    const libp2pIdentity = await deriveFromPrivateKey(current.privateKey)
    const restored: DeviceIdentity = {
      ...current,
      deviceId: libp2pIdentity.peerId,
      deviceName: libp2pIdentity.peerId,
      publicKey: libp2pIdentity.publicKey,
      privateKey: libp2pIdentity.privateKey,
    }
    identity = restored
    repo.upsert(restored)
    return identity
  }

  return {
    get: getLocalIdentity,
    // getPublic: async () => {
    //   if (!identity) {
    //     identity = await getLocalIdentity()
    //   }
    //   return toTrustRequestPayload(identity)
    // },
    rename: async (name: string) => {
      const current = await getLocalIdentity()
      const updated: DeviceIdentity = {
        ...current,
        deviceName: name,
      }
      await repo.upsert(updated)
      identity = updated
    },
    updateMultiaddrs: async (multiaddrs: string[]) => {
      const current = await getLocalIdentity()
      const updated: DeviceIdentity = {
        ...current,
        multiaddrs: multiaddrs,
      }
      await repo.upsert(updated)
      identity = updated
    }
  }
}

async function createLibp2pIdentity(): Promise<{ peerId: string; privateKey: string; publicKey: string }> {
  try {
    const key = (await generateKeyPair("Ed25519")) as any;
    const privBytes: Uint8Array = privateKeyToProtobuf(key);
    const privB64 = Buffer.from(privBytes).toString("base64");
    const pubBytes: Uint8Array =
      key?.publicKey?.raw ?? key?.publicKey?.bytes ?? key?.publicKey?.marshal?.() ?? new Uint8Array();
    const pubB64 = Buffer.from(pubBytes).toString("base64");
    const peerId = peerIdToString(peerIdFromPrivateKey(key));
    console.info("[identity] createLibp2pIdentity", {
      peerId,
      privLen: privBytes?.length || 0,
      pubLen: pubBytes.length || 0,
      privPreview: privB64.slice(0, 24),
    });
    return { peerId, privateKey: privB64, publicKey: pubB64 };
  } catch (err: any) {
    console.warn("[identity] createLibp2pIdentity failed", {
      error: err?.message || err,
      stack: err?.stack,
    });
    const randomPid = await deviceIdToPeerId(
      crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    );
    return { peerId: randomPid, privateKey: "", publicKey: "" };
  }
}

async function deriveFromPrivateKey(privB64: string): Promise<{ peerId: string; privateKey: string; publicKey: string }> {
  const bytes = Buffer.from(privB64, "base64");
  const priv = privateKeyFromProtobuf(bytes);
  const peerId = peerIdToString(peerIdFromPrivateKey(priv as any));
  const pubBytes: Uint8Array =
    (priv as any).publicKey?.raw ??
    (priv as any).publicKey?.bytes ??
    (priv as any).publicKey?.marshal?.() ??
    (priv as any).public?.bytes ??
    (priv as any).public?.marshal?.() ??
    new Uint8Array();
  const pubB64 = Buffer.from(pubBytes).toString("base64");
  console.info("[identity] deriveFromPrivateKey", {
    peerId,
    privLen: privB64.length,
    privPreview: privB64.slice(0, 24),
    keyType: (priv as any).type,
    pubLen: pubBytes.length,
  });
  return { peerId, privateKey: privB64, publicKey: pubB64 };
}
