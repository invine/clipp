import type { MessagingTransport } from "./transport.js";
import { createProtocolMessenger, type ProtocolMessenger } from "./protocolMessenger.js";
import { withTrustedPeers, type TrustPredicate } from "./trusted.js";
import {
  CLIP_TRUST_PROTOCOL,
  type TrustMessage,
  encodeTrustMessage,
  decodeTrustMessage,
} from "../protocols/clipTrust.js";
import {
  HISTORY_PROTOCOL,
  type HistorySyncMessage,
  encodeHistorySyncMessage,
  decodeHistorySyncMessage,
} from "../protocols/history.js";

export function createTrustMessenger(transport: MessagingTransport): ProtocolMessenger<TrustMessage> {
  return createProtocolMessenger(transport, CLIP_TRUST_PROTOCOL, {
    encode: encodeTrustMessage,
    decode: decodeTrustMessage,
  });
}

export function createHistoryMessenger(transport: MessagingTransport): ProtocolMessenger<HistorySyncMessage> {
  return createProtocolMessenger(transport, HISTORY_PROTOCOL, {
    encode: encodeHistorySyncMessage,
    decode: decodeHistorySyncMessage,
  });
}

export function createTrustedHistoryMessenger(
  transport: MessagingTransport,
  isTrusted: TrustPredicate
): ProtocolMessenger<HistorySyncMessage> {
  return withTrustedPeers(createHistoryMessenger(transport), isTrusted);
}
