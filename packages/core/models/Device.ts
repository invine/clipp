/**
 * Represents a paired device in the user's trusted network.
 */
export interface Device {
  /** Device Peer ID or UUID */
  id: string;
  /** User-assigned device name */
  name: string;
  /** Device public key (base64) */
  publicKey: string;
  /** Timestamp when device was added (epoch ms) */
  addedAt: number;
}

/**
 * Validate a Device object.
 */
export function validateDevice(device: Device): boolean {
  return (
    typeof device.id === "string" &&
    typeof device.name === "string" &&
    typeof device.publicKey === "string" &&
    typeof device.addedAt === "number"
  );
}
