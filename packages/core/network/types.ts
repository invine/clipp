/**
 * ClipboardMessage protocol types for P2P clipboard sync.
 */
import type { Clip } from "../models/Clip";

export interface ClipboardMessage {
  type: "CLIP" | "trust-request" | "trust-ack";
  from: string; // libp2p Peer ID
  clip?: Clip;
  payload?: any;
  sentAt: number; // Timestamp (ms)
}
