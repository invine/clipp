import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import type { IdentityKeyMaterial } from "../../../packages/core/trust";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function keyMaterialFromPrivateKey(key: any, privateKey: string): IdentityKeyMaterial {
  const publicKey = key.publicKey?.raw ?? key.publicKey?.bytes ?? key.publicKey?.marshal?.();
  if (!(publicKey instanceof Uint8Array)) throw new Error("identity_public_key_unavailable");
  return {
    peerId: peerIdFromPrivateKey(key).toString(),
    privateKey,
    publicKey: bytesToBase64(publicKey),
  };
}

/**
 * MV3 service workers cannot evaluate dynamic import(). Keep libp2p key
 * dependencies statically linked in extension entry points instead.
 */
export async function generateExtensionIdentityKeyMaterial(): Promise<IdentityKeyMaterial> {
  const key = await generateKeyPair("Ed25519");
  return keyMaterialFromPrivateKey(key, bytesToBase64(privateKeyToProtobuf(key)));
}

export async function deriveExtensionIdentityKeyMaterial(privateKey: string): Promise<IdentityKeyMaterial> {
  return keyMaterialFromPrivateKey(privateKeyFromProtobuf(base64ToBytes(privateKey)), privateKey);
}
