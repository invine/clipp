// import { StorageBackend } from "./trust-manager.js";
// import { DEFAULT_WEBRTC_STAR_RELAYS } from "../network/constants.js";
// TODO: check if these imports are needed
import { deviceIdToPeerId, normalizePeerId, peerIdToString } from "../network/peerId.js";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey, peerIdFromString } from "@libp2p/peer-id";
// import { base58btc } from "multiformats/bases/base58";
import { toTrustRequestPayload, TrustedDevice } from "./trustManager.js";

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  privateKey?: string;
  // multiaddr: string;
  multiaddrs: string[];
  createdAt: number;
}

export interface IdentityRepository {
  get(): Promise<DeviceIdentity | undefined>
  upsert(identity: DeviceIdentity): Promise<void>
}

export interface IdentityService {
  get(): Promise<DeviceIdentity>
  getPublic(): Promise<TrustedDevice>
  rename(name: string): Promise<void>
  updateMultiaddrs(multiaddrs: string[]): Promise<void>
}

export function createIdentityService(options: {
  repo: IdentityRepository,
  now?: () => number
}): IdentityService {
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
    getPublic: async () => {
      if (!identity) {
        identity = await getLocalIdentity()
      }
      return toTrustRequestPayload(identity)
    },
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

// export async function getLocalIdentity(repo: IdentityRepository): Promise<DeviceIdentity> {
//   const existing = await repo.get();
//   if (existing) {
//     let peerId = existing.deviceId;
//     let updated = false;
//     const missingPriv = !existing.privateKey || existing.privateKey.trim().length < 20;
//     const missingPub = !existing.publicKey || existing.publicKey.trim().length < 20;
//     const invalidPid = !isValidPeerId(existing.deviceId);
//     console.info("[identity] load existing", {
//       deviceId: existing.deviceId,
//       missingPriv,
//       missingPub,
//       invalidPid,
//       hasMultiaddrs: Array.isArray(existing.multiaddrs) && existing.multiaddrs.length > 0,
//     });
//
//     // Ensure we have a private key; if missing, generate and persist.
//     if (missingPriv) {
//       const fresh = await createLibp2pIdentity();
//       existing.privateKey = fresh.privateKey;
//       existing.publicKey = fresh.publicKey;
//       peerId = fresh.peerId;
//       updated = true;
//       console.info("[identity] generated new keypair during migration", { peerId });
//     }
//
//     // Derive peerId and publicKey from stored private key.
//     if (existing.privateKey) {
//       try {
//         const derived = await deriveFromPrivateKey(existing.privateKey);
//         peerId = derived.peerId;
//         // TODO: this is excessive
//         if (missingPub || existing.publicKey !== derived.publicKey) {
//           existing.publicKey = derived.publicKey;
//           updated = true;
//           console.info("[identity] derived missing public key from private key", { peerId });
//         }
//       } catch (err: any) {
//         console.warn("[identity] failed to derive from stored private key", err?.message || err);
//         const fresh = await createLibp2pIdentity();
//         peerId = fresh.peerId;
//         existing.privateKey = fresh.privateKey;
//         existing.publicKey = fresh.publicKey;
//         updated = true;
//         console.info("[identity] replaced invalid private key with fresh", { peerId });
//       }
//     }

// TODO: why this is here? From here
// const derivedAddrs = buildDerivedAddrs(peerId);
// const merged = dedupeAddrs([...(existing.multiaddrs || []), ...derivedAddrs]);
// const needsRebuild =
//   !Array.isArray(existing.multiaddrs) ||
//   existing.multiaddrs.length === 0 ||
//   merged.length !== existing.multiaddrs.length ||
//   merged.some((addr, idx) => addr !== existing.multiaddrs[idx]) ||
//   existing.multiaddrs.some((addr) => addr.includes(existing.deviceId) || !addr.includes(peerId));
//
// const normalizedId = await normalizePeerId(peerId);
//
// if (needsRebuild || existing.deviceId !== normalizedId || updated) {
//   existing.deviceId = normalizedId;
//   existing.multiaddrs = merged;
//   existing.multiaddr = merged[0] || `/p2p/${normalizedId}`;
//   await persistIdentity(repo, existing, "update-existing");
// } else if (!existing.multiaddr) {
//   existing.multiaddr = existing.multiaddrs[0];
//   await persistIdentity(repo, existing, "fill-multiaddr");
// }
// TODO: till here

// if (updated) {
//   repo.upsert(existing)
// }
// return existing;
//   }
//
// No identity persisted: generate and store a new one.
// const fresh = await createLibp2pIdentity();
// // TODO: refactor. Address should come from libp2p update
// const multiaddrs = buildDerivedAddrs(fresh.peerId);
// const identity: DeviceIdentity = {
//   deviceId: fresh.peerId,
//   deviceName: typeof navigator !== "undefined" ? navigator.userAgent : "Device",
//   publicKey: fresh.publicKey,
//   privateKey: fresh.privateKey,
//   // TODO: get rid of multiaddr. keep only multiaddrs
//   multiaddr: multiaddrs[0] || `/p2p/${fresh.peerId}`,
//   multiaddrs,
//   createdAt: Date.now(),
// };
// await repo.upsert(identity);
// // await persistIdentity(repo, identity, "create-new");
// return identity;
// }

// export async function setLocalIdentityName(storage: StorageBackend, deviceName: string): Promise<DeviceIdentity> {
//   const identity = await getLocalIdentity(storage);
//   identity.deviceName = deviceName;
//   await storage.set(ID_KEY, identity);
//   return identity;
// }
//
// function buildDerivedAddrs(peerId: string): string[] {
//   const relayEnv = getRelayEnv();
//   const derived: string[] = [];
//   if (relayEnv) {
//     derived.push(`${relayEnv}/p2p-circuit/p2p/${peerId}`);
//   }
//   derived.push(...DEFAULT_WEBRTC_STAR_RELAYS.map((addr) => `${addr}/p2p/${peerId}`));
//   return dedupeAddrs(derived);
// }
//
// function dedupeAddrs(values: string[]): string[] {
//   const seen = new Set<string>();
//   const out: string[] = [];
//   for (const v of values) {
//     if (!v || seen.has(v)) continue;
//     seen.add(v);
//     out.push(v);
//   }
//   return out;
// }
//
// function getRelayEnv(): string | undefined {
//   if (typeof process === "undefined" || !process?.env) return undefined;
//   const relay = process.env.CLIPP_RELAY_ADDR || process.env.CLIPP_RELAY_MULTIADDR;
//   return relay && relay.trim().length > 0 ? relay.trim() : undefined;
// }

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

// function isValidPeerId(value: string | undefined): boolean {
//   if (!value || typeof value !== "string") return false;
//   try {
//     peerIdFromString(value);
//     return true;
//   } catch {
//     try {
//       peerIdFromString(value, base58btc);
//       return true;
//     } catch {
//       return false;
//     }
//   }
// }

// async function persistIdentity(storage: StorageBackend, identity: DeviceIdentity, reason: string) {
//   try {
//     await storage.set(ID_KEY, identity);
//     console.info("[identity] persisted", {
//       reason,
//       deviceId: identity.deviceId,
//       hasPrivateKey: !!identity.privateKey && identity.privateKey.length > 20,
//       hasPublicKey: !!identity.publicKey && identity.publicKey.length > 20,
//       multiaddrs: identity.multiaddrs,
//     });
//   } catch (err: any) {
//     console.warn("[identity] failed to persist", {
//       reason,
//       error: err?.message || err,
//     });
//   }
// }
