import type { MessagingTransport } from "./transport.js";
import { createProtocolMessenger, type ProtocolMessenger } from "./protocolMessenger.js";
import {
  CLIP_TRUST_PROTOCOL,
  type TrustMessage,
  encodeTrustMessage,
  decodeTrustMessage,
} from "../protocols/clipTrust.js";

export function createTrustMessenger(transport: MessagingTransport): ProtocolMessenger<TrustMessage> {
  return createProtocolMessenger(transport, CLIP_TRUST_PROTOCOL, {
    encode: encodeTrustMessage,
    decode: decodeTrustMessage,
  });
}
