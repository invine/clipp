/**
 * Type definition for device pairing QR payload.
 */
export interface PairingPayload {
  id: string; // libp2p Peer ID or UUID
  name: string; // User-assigned device name
  publicKey: string; // Base64-encoded libp2p public key
  createdAt: number; // Timestamp (ms)
  version: string; // App version or protocol version
}
