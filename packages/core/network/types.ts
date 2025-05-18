/**
 * ClipboardMessage protocol types for P2P clipboard sync.
 */
import type { Clip } from "../models/Clip";

export interface ClipboardMessage {
  type: "CLIP";
  from: string; // libp2p Peer ID
  clip: Clip;
  sentAt: number; // Timestamp (ms)
}
