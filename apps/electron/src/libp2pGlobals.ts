import wrtc from "@koush/wrtc";
import WebSocket from "ws";
import { webcrypto } from "node:crypto";

// Ensure WebRTC/WebCrypto globals exist before importing libp2p deps that expect them.
const wrtcImpl: any = wrtc;
(globalThis as any).RTCPeerConnection =
  (globalThis as any).RTCPeerConnection || wrtcImpl?.RTCPeerConnection;
(globalThis as any).RTCSessionDescription =
  (globalThis as any).RTCSessionDescription || wrtcImpl?.RTCSessionDescription;
(globalThis as any).RTCIceCandidate =
  (globalThis as any).RTCIceCandidate || wrtcImpl?.RTCIceCandidate;
(globalThis as any).WebSocket =
  (globalThis as any).WebSocket || (WebSocket as any);
try {
  if (!(globalThis as any).navigator) {
    (globalThis as any).navigator = { userAgent: "Clipp Desktop" } as any;
  }
} catch { }
try {
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = webcrypto;
  }
} catch { }

