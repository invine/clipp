/**
 * Enum for supported clipboard item types.
 */
export enum ClipType {
  TEXT = "text",
  URL = "url",
  IMAGE = "image",
  FILE = "file"
}

/**
 * Enum for supported sync message types.
 */
export enum SyncMessageType {
  NEW_CLIP = "NEW_CLIP",
  SYNC_HISTORY = "SYNC_HISTORY",
  HELLO = "HELLO",
  ACK = "ACK"
}
