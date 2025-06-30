/**
 * Enum for supported clipboard item types.
 */
export enum ClipType {
  Text = "text",
  Url = "url",
  Image = "image",
  File = "file",
}

/**
 * Enum for supported sync message types.
 */
export enum MessageType {
  NewClip = "NEW_CLIP",
  SyncHistory = "SYNC_HISTORY",
  Hello = "HELLO",
  Ack = "ACK",
}
