/**
 * Type definition for trusted device records.
 */
export interface TrustedDevice {
  id: string; // libp2p Peer ID
  name: string; // User-assigned name
  publicKey: string; // Base64-encoded libp2p public key
  createdAt: number; // Timestamp (ms)
  lastSeen?: number; // Optional last connection timestamp
}
