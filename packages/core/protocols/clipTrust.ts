import type { DeviceIdentity } from "../trust/identity.js";
import type { PrivateKey, PublicKey } from "@libp2p/interface";
import {
  decodeJsonMessage,
  encodeJsonMessage,
  isRecord,
  resolveSentAt,
  type DirectedProtocolMessage,
} from "./base.js";

export const CLIP_TRUST_PROTOCOL = "/clipboard/trust/1.0.0";

export type TrustRequestPayload = Omit<DeviceIdentity, "privateKey">;

export type TrustRequestMessage = DirectedProtocolMessage<
  "trust-request",
  {
    device: TrustRequestPayload;
    sig: string;
  }
>;

export type TrustAckMessage = DirectedProtocolMessage<
  "trust-ack",
  {
    accepted: boolean;
    request: TrustRequestMessage;
    responder?: TrustRequestPayload;
  } & Record<string, unknown>
>;

export type TrustMessage = TrustRequestMessage | TrustAckMessage;

export function encodeTrustMessage(msg: TrustMessage): Uint8Array {
  return encodeJsonMessage(msg);
}

function normalizeTrustRequestMessage(
  parsed: unknown,
  from: string,
  useEmbeddedFrom = false
): TrustRequestMessage | null {
  if (
    !isRecord(parsed) ||
    parsed.type !== "trust-request" ||
    typeof parsed.from !== "string" ||
    typeof parsed.to !== "string"
  ) {
    return null;
  }
  const actualFrom =
    useEmbeddedFrom && typeof parsed.from === "string" ? parsed.from : from;
  if (!isRecord(parsed.payload) || typeof parsed.payload.sig !== "string" || !isRecord(parsed.payload.device)) {
    return null;
  }
  return {
    type: "trust-request",
    from: actualFrom,
    to: parsed.to,
    payload: {
      device: parsed.payload.device as TrustRequestPayload,
      sig: parsed.payload.sig,
    },
    sentAt: resolveSentAt(parsed.sentAt),
  };
}

function normalizeTrustAckMessage(parsed: unknown, from: string): TrustAckMessage | null {
  if (
    !isRecord(parsed) ||
    parsed.type !== "trust-ack" ||
    typeof parsed.from !== "string" ||
    typeof parsed.to !== "string" ||
    !isRecord(parsed.payload)
  ) {
    return null;
  }
  const normalizedRequest = normalizeTrustRequestMessage(parsed.payload.request, from, true);
  if (!normalizedRequest || typeof parsed.payload.accepted !== "boolean") {
    return null;
  }
  return {
    type: "trust-ack",
    from,
    to: parsed.to,
    payload: {
      ...parsed.payload,
      accepted: parsed.payload.accepted,
      request: normalizedRequest,
      responder: isRecord(parsed.payload.responder)
        ? (parsed.payload.responder as TrustRequestPayload)
        : undefined,
    },
    sentAt: resolveSentAt(parsed.sentAt),
  };
}

export function decodeTrustMessage(data: Uint8Array, from: string): TrustMessage | null {
  const parsed = decodeJsonMessage(data);
  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
  if (parsed.type === "trust-request") {
    return normalizeTrustRequestMessage(parsed, from);
  }
  if (parsed.type === "trust-ack") {
    return normalizeTrustAckMessage(parsed, from);
  }
  return null;
}

export function toTrustRequestPayload(identity: DeviceIdentity): TrustRequestPayload {
  const payload = { ...(identity as any) };
  delete payload.privateKey;
  return payload as TrustRequestPayload;
}

function stableStringify(value: any): string {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return JSON.stringify(value);
  }
  if (type !== "object") return "null";
  if (Array.isArray(value)) {
    const items = value.map((v) => {
      const vt = typeof v;
      if (v === undefined || vt === "function" || vt === "symbol") return "null";
      return stableStringify(v);
    });
    return `[${items.join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const props: string[] = [];
  for (const k of keys) {
    const v = (value as any)[k];
    const vt = typeof v;
    if (v === undefined || vt === "function" || vt === "symbol") continue;
    props.push(`${JSON.stringify(k)}:${stableStringify(v)}`);
  }
  return `{${props.join(",")}}`;
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function requestSigningBytes(req: {
  from: string;
  to: string;
  device: TrustRequestPayload;
  sentAt: number;
}): Uint8Array {
  const unsigned = {
    type: "trust-request" as const,
    from: req.from,
    to: req.to,
    payload: {
      device: req.device,
    },
    sentAt: req.sentAt,
  };
  return new TextEncoder().encode(stableStringify(unsigned));
}

async function maybeAwait<T>(value: T | Promise<T>): Promise<T> {
  return await Promise.resolve(value);
}

export async function createSignedTrustRequestFromKey(options: {
  from: string;
  to: string;
  payload: TrustRequestPayload;
  privateKey: PrivateKey;
  sentAt?: number;
  now?: () => number;
}): Promise<TrustRequestMessage> {
  const sentAt = typeof options.sentAt === "number" ? options.sentAt : (options.now ?? Date.now)();
  const bytes = requestSigningBytes({
    from: options.from,
    to: options.to,
    device: options.payload,
    sentAt,
  });
  const sigBytes = await maybeAwait(options.privateKey.sign(bytes));
  return {
    type: "trust-request",
    from: options.from,
    to: options.to,
    payload: {
      device: options.payload,
      sig: bytesToB64(sigBytes),
    },
    sentAt,
  };
}

export async function createSignedTrustRequest(identity: DeviceIdentity, to: string, now?: () => number): Promise<TrustRequestMessage> {
  if (!identity?.privateKey) {
    throw new Error("missing_private_key");
  }
  const privBytes = b64ToBytes(identity.privateKey);
  const { privateKeyFromProtobuf } = await import("@libp2p/crypto/keys");
  const privateKey = privateKeyFromProtobuf(privBytes);
  return await createSignedTrustRequestFromKey({
    from: identity.deviceId,
    to,
    payload: toTrustRequestPayload(identity),
    privateKey: privateKey as any,
    now,
  });
}

export async function verifyTrustRequestSignature(req: TrustRequestMessage): Promise<boolean> {
  try {
    if (!req || req.type !== "trust-request") return false;
    if (typeof req.from !== "string" || typeof req.to !== "string") return false;
    if (!req.payload || typeof req.payload !== "object") return false;
    if (typeof req.sentAt !== "number") return false;
    if (typeof req.payload.sig !== "string" || req.payload.sig.length === 0) return false;

    // TODO: remove dynamic import
    const { peerIdFromString } = await import("@libp2p/peer-id");
    const peer = peerIdFromString(req.from) as any;
    const publicKey: PublicKey | undefined = peer?.publicKey;
    if (!publicKey) return false;
    return await verifyTrustRequestSignatureWithPublicKey(req, publicKey);
  } catch {
    return false;
  }
}

export async function verifyTrustRequestSignatureWithPublicKey(req: TrustRequestMessage, publicKey: PublicKey): Promise<boolean> {
  try {
    if (!req || req.type !== "trust-request") return false;
    if (typeof req.from !== "string" || typeof req.to !== "string") return false;
    if (!req.payload || typeof req.payload !== "object" || !isRecord(req.payload.device)) return false;
    if (typeof req.sentAt !== "number") return false;
    if (typeof req.payload.sig !== "string" || req.payload.sig.length === 0) return false;
    if (!publicKey || typeof (publicKey as any).verify !== "function") return false;

    const data = requestSigningBytes({
      from: req.from,
      to: req.to,
      device: req.payload.device,
      sentAt: req.sentAt,
    });
    const sigBytes = b64ToBytes(req.payload.sig);
    const ok = (publicKey as any).verify(data, sigBytes);
    return await maybeAwait(ok);
  } catch {
    return false;
  }
}

export async function validate(msg: TrustMessage): Promise<boolean> {
  if (!msg || typeof msg.from !== "string" || typeof msg.sentAt !== "number") return false;
  if (msg.type === "trust-request") {
    return typeof msg.to === "string" &&
      isRecord(msg.payload) &&
      isRecord(msg.payload.device) &&
      typeof msg.payload.sig === "string";
  }
  return msg.type === "trust-ack" &&
    typeof msg.to === "string" &&
    isRecord(msg.payload) &&
    typeof msg.payload.accepted === "boolean" &&
    isRecord(msg.payload.request);
}
