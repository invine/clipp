import type { MessagingTransport } from "../messaging/transport.js";
import type { MembershipStatus } from "../pairing/membership.js";
import { normalizeDeviceName } from "../pairing/presentation.js";
import { peerIdFromMultihashBytes, peerIdToMultihashBytes } from "../pairing/protocol.js";
import type { MembershipView } from "../trust/identity.js";

export const MEMBERSHIP_PROTOCOL = "/clipp/membership/1.0.0";
export const MEMBERSHIP_MAX_FRAME_BYTES = 256 * 1024;

export type MembershipPeerRecord = { peerId: string; envelope: Uint8Array };
export type MembershipMessage = MembershipView & {
  senderDeviceName: string;
  senderNameRevision: bigint;
  signedPeerRecords?: MembershipPeerRecord[];
};

export type MembershipReconciliationIdentity = {
  get(): Promise<{ deviceId: string; deviceName: string; nameRevision?: number }>;
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  membershipView(): Promise<MembershipView>;
  mergeMembershipView(view: MembershipView): Promise<boolean>;
  recordRemoteDeviceName(peerId: string, name: string, revision: bigint): Promise<void>;
  onMembershipChanged?(listener: () => void): () => void;
};

/** Adapt the transport's local signed record APIs without making reachability authoritative. */
export function createMembershipPeerRecordBridge(options: {
  transport: Pick<MessagingTransport, "getSignedPeerRecord" | "importSignedPeerRecord">;
  identity: Pick<MembershipReconciliationIdentity, "get">;
}): Pick<Parameters<typeof createMembershipReconciler>[0], "signedPeerRecords" | "importSignedPeerRecord"> {
  return {
    signedPeerRecords: async () => {
      try {
        const envelope = await options.transport.getSignedPeerRecord?.();
        return envelope ? [{ peerId: (await options.identity.get()).deviceId, envelope }] : [];
      } catch { return []; }
    },
    importSignedPeerRecord: (record) => options.transport.importSignedPeerRecord?.(record.peerId, record.envelope) ?? Promise.resolve(),
  };
}

/**
 * The shared authenticated Membership Reconciliation boundary.  The transport
 * supplies the immediate libp2p-authenticated sender; no identity in the
 * protobuf payload contributes authority.
 */
export function createMembershipReconciler(options: {
  transport: MessagingTransport;
  identity: MembershipReconciliationIdentity;
  signedPeerRecords?: () => Promise<MembershipPeerRecord[]>;
  importSignedPeerRecord?: (record: MembershipPeerRecord) => Promise<void>;
  onChanged?: () => void | Promise<void>;
}) {
  let started = false;
  let stopped = false;
  let unsubscribeMembership: (() => void) | undefined;

  const push = async (targetPeerId: string): Promise<void> => {
    const status = await options.identity.membershipStatus(targetPeerId);
    // A revoked remote may receive the complete view that proves its status,
    // but it never gains authority to contribute one.
    if (stopped || (status !== "active" && status !== "revoked")) return;
    const [local, view, records] = await Promise.all([
      options.identity.get(),
      options.identity.membershipView(),
      options.signedPeerRecords?.() ?? Promise.resolve([]),
    ]);
    await options.transport.send(MEMBERSHIP_PROTOCOL, targetPeerId, encodeMembershipFrame({
      ...view,
      senderDeviceName: local.deviceName,
      senderNameRevision: BigInt(local.nameRevision ?? 0),
      signedPeerRecords: records,
    }));
  };

  const pushConnected = async (): Promise<void> => {
    await Promise.allSettled(options.transport.getConnectedPeers()
      .map(push));
  };

  const receive = async (authenticatedPeerId: string, frame: Uint8Array): Promise<void> => {
    const message = decodeMembershipFrame(frame);
    if (!message || stopped) return;
    // Check immediately before persistence, against the receiver's pre-merge
    // view.  In particular, a peer self-asserted by this message has no power.
    if (await options.identity.membershipStatus(authenticatedPeerId) !== "active") return;
    const changed = await options.identity.mergeMembershipView({
      admittedPeerIds: message.admittedPeerIds,
      revokedPeerIds: message.revokedPeerIds,
    });
    // Membership is committed above before presentation, reachability, UI, or
    // any propagation side effect.  Invalid presentation data is nonfatal.
    await options.identity.recordRemoteDeviceName(authenticatedPeerId, message.senderDeviceName, message.senderNameRevision)
      .catch(() => undefined);
    const activeRecords = (await Promise.all((message.signedPeerRecords ?? []).map(async (record) =>
      await options.identity.membershipStatus(record.peerId) === "active" ? record : undefined
    ))).filter((record): record is MembershipPeerRecord => Boolean(record));
    await Promise.allSettled(activeRecords.map((record) => options.importSignedPeerRecord?.(record)));
    if (!changed) return;
    await options.onChanged?.();
    await pushConnected();
  };

  return {
    start(): void {
      if (started) return;
      started = true;
      options.transport.onMessage(MEMBERSHIP_PROTOCOL, (from, frame) => { void receive(from, frame); });
      options.transport.onPeerConnected((peerId) => { void push(peerId); });
      unsubscribeMembership = options.identity.onMembershipChanged?.(() => { void pushConnected(); });
      void pushConnected();
    },
    push,
    pushConnected,
    receive,
    stop(): void { stopped = true; unsubscribeMembership?.(); },
  };
}

export function encodeMembershipFrame(message: MembershipMessage, maximumBytes = MEMBERSHIP_MAX_FRAME_BYTES): Uint8Array {
  const admitted = canonicalPeerIds(message.admittedPeerIds);
  const revoked = canonicalPeerIds(message.revokedPeerIds);
  const name = normalizeDeviceName(message.senderDeviceName);
  if (!name || message.senderNameRevision < 0n) throw new Error("invalid_membership_view");
  const records = message.signedPeerRecords ?? [];
  const payload = join([
    ...admitted.map((peerId) => bytesField(1, peerIdToMultihashBytes(peerId))),
    ...revoked.map((peerId) => bytesField(2, peerIdToMultihashBytes(peerId))),
    bytesField(3, new TextEncoder().encode(name)),
    varintField(4, message.senderNameRevision),
    ...records.map(encodePeerRecord),
  ]);
  if (payload.length > maximumBytes) throw new Error("membership_frame_too_large");
  return join([varint(BigInt(payload.length)), payload]);
}

export function decodeMembershipFrame(frame: Uint8Array, maximumBytes = MEMBERSHIP_MAX_FRAME_BYTES): MembershipMessage | null {
  const prefix = readVarint(frame, 0);
  if (!prefix || prefix.value > BigInt(maximumBytes) || prefix.value !== BigInt(frame.length - prefix.next)) return null;
  const fields = readFields(frame.slice(prefix.next), new Set([1, 2, 3, 4, 5]));
  if (!fields) return null;
  const name = singleBytes(fields, 3);
  const revision = singleVarint(fields, 4);
  if (!name || revision === undefined) return null;
  // Presentation is explicitly non-authoritative. Preserve an invalid name as
  // an empty value so membership still converges and its revision can advance.
  const senderDeviceName = normalizeDeviceName(new TextDecoder().decode(name)) ?? "";
  try {
    const admittedPeerIds = canonicalPeerIds((fields.get(1) ?? []).map((field) => peerIdFromMultihashBytes(field as Uint8Array)));
    const revokedPeerIds = canonicalPeerIds((fields.get(2) ?? []).map((field) => peerIdFromMultihashBytes(field as Uint8Array)));
    const signedPeerRecords = (fields.get(5) ?? []).map((field) => decodePeerRecord(field as Uint8Array)).filter((record): record is MembershipPeerRecord => Boolean(record));
    if (signedPeerRecords.length !== (fields.get(5) ?? []).length) return null;
    return { admittedPeerIds, revokedPeerIds, senderDeviceName, senderNameRevision: revision, signedPeerRecords };
  } catch { return null; }
}

function canonicalPeerIds(peerIds: string[]): string[] {
  if (!Array.isArray(peerIds)) throw new Error("invalid_membership_view");
  const canonical = peerIds.map((peerId) => {
    const bytes = peerIdToMultihashBytes(peerId);
    return peerIdFromMultihashBytes(bytes);
  });
  return [...new Set(canonical)].sort();
}
function encodePeerRecord(record: MembershipPeerRecord): Uint8Array {
  if (!record.envelope.length) throw new Error("invalid_peer_record");
  return bytesField(5, join([bytesField(1, peerIdToMultihashBytes(record.peerId)), bytesField(2, record.envelope)]));
}
function decodePeerRecord(bytes: Uint8Array): MembershipPeerRecord | null {
  const fields = readFields(bytes, new Set([1, 2]));
  const peerId = fields && singleBytes(fields, 1);
  const envelope = fields && singleBytes(fields, 2);
  if (!peerId || !envelope?.length) return null;
  try { return { peerId: peerIdFromMultihashBytes(peerId), envelope }; } catch { return null; }
}
function join(parts: Uint8Array[]): Uint8Array { const length = parts.reduce((total, part) => total + part.length, 0); const result = new Uint8Array(length); let at = 0; for (const part of parts) { result.set(part, at); at += part.length; } return result; }
function bytesField(field: number, value: Uint8Array): Uint8Array { return join([varint(BigInt((field << 3) | 2)), varint(BigInt(value.length)), value]); }
function varintField(field: number, value: bigint): Uint8Array { return join([varint(BigInt(field << 3)), varint(value)]); }
function varint(value: bigint): Uint8Array { if (value < 0n || value > (1n << 64n) - 1n) throw new Error("invalid_varint"); const out: number[] = []; do { const byte = Number(value & 127n); value >>= 7n; out.push(value ? byte | 128 : byte); } while (value); return Uint8Array.from(out); }
function readVarint(bytes: Uint8Array, start: number): { value: bigint; next: number } | null { let value = 0n; for (let index = start, shift = 0n; index < bytes.length && index < start + 10; index += 1, shift += 7n) { const byte = bytes[index]; value |= BigInt(byte & 127) << shift; if ((byte & 128) === 0) { const next = index + 1; return varint(value).length === next - start ? { value, next } : null; } } return null; }
function readFields(bytes: Uint8Array, recognized: Set<number>): Map<number, Array<Uint8Array | bigint>> | null { const result = new Map<number, Array<Uint8Array | bigint>>(); for (let offset = 0; offset < bytes.length;) { const key = readVarint(bytes, offset); if (!key || key.value === 0n || key.value > BigInt(Number.MAX_SAFE_INTEGER)) return null; offset = key.next; const field = Number(key.value >> 3n); const wire = Number(key.value & 7n); let value: Uint8Array | bigint; if (wire === 0) { const parsed = readVarint(bytes, offset); if (!parsed) return null; value = parsed.value; offset = parsed.next; } else if (wire === 2) { const length = readVarint(bytes, offset); if (!length || length.value > BigInt(bytes.length - length.next)) return null; const end = length.next + Number(length.value); value = bytes.slice(length.next, end); offset = end; } else return null; if (recognized.has(field)) result.set(field, [...(result.get(field) ?? []), value]); } return result; }
function singleBytes(fields: Map<number, Array<Uint8Array | bigint>>, field: number): Uint8Array | null { const values = fields.get(field); return values?.length === 1 && values[0] instanceof Uint8Array ? values[0] : null; }
function singleVarint(fields: Map<number, Array<Uint8Array | bigint>>, field: number): bigint | undefined { const values = fields.get(field); return values?.length === 1 && typeof values[0] === "bigint" ? values[0] : undefined; }
