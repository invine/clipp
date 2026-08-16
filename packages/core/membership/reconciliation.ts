import type { MessagingTransport } from "../messaging/transport.js";
import type { DevicePresentation, MembershipStatus } from "../pairing/membership.js";
import { normalizeDeviceName } from "../pairing/presentation.js";
import { peerIdFromMultihashBytes, peerIdToMultihashBytes } from "../pairing/protocol.js";
import type { MembershipView } from "../trust/identity.js";
import * as log from "../logger.js";

export const MEMBERSHIP_PROTOCOL = "/clipp/membership/1.0.0";
export const MEMBERSHIP_MAX_FRAME_BYTES = 256 * 1024;

export type MembershipPeerRecord = { peerId: string; envelope: Uint8Array };
export type MembershipSenderPresentation = DevicePresentation;
export type MembershipMessage = MembershipView & {
  senderPresentation?: MembershipSenderPresentation;
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
  transport: Pick<MessagingTransport, "getSignedPeerRecord" | "getSignedPeerRecordFor" | "importSignedPeerRecord">;
  identity: Pick<MembershipReconciliationIdentity, "get" | "membershipView">;
}): Pick<Parameters<typeof createMembershipReconciler>[0], "signedPeerRecords" | "importSignedPeerRecord"> {
  return {
    signedPeerRecords: async () => {
      try {
        const [identity, view] = await Promise.all([options.identity.get(), options.identity.membershipView()]);
        const activePeerIds = view.admittedPeerIds.filter((peerId) => !view.revokedPeerIds.includes(peerId));
        const records = await Promise.all(activePeerIds.map(async (peerId) => {
          const envelope = peerId === identity.deviceId
            ? await options.transport.getSignedPeerRecord?.()
            : await options.transport.getSignedPeerRecordFor?.(peerId);
          return envelope ? { peerId, envelope } : undefined;
        }));
        return records.filter((record): record is MembershipPeerRecord => Boolean(record));
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
  let observesMembershipChanges = false;
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
      senderPresentation: {
        deviceName: local.deviceName,
        nameRevision: BigInt(local.nameRevision ?? 0),
      },
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
    if (message.senderPresentation) {
      await options.identity.recordRemoteDeviceName(
        authenticatedPeerId,
        message.senderPresentation.deviceName,
        message.senderPresentation.nameRevision,
      )
        .catch(() => undefined);
    }
    const activeRecords = (await Promise.all((message.signedPeerRecords ?? []).map(async (record) =>
      await options.identity.membershipStatus(record.peerId) === "active" ? record : undefined
    ))).filter((record): record is MembershipPeerRecord => Boolean(record));
    const importResults = await Promise.allSettled(activeRecords.map((record) => options.importSignedPeerRecord?.(record)));
    importResults.forEach((result, index) => {
      if (result.status === "rejected") {
        log.warn("Membership Signed Peer Record ignored", {
          reason: "verification_failed",
          peerId: activeRecords[index].peerId,
        });
      }
    });
    if (!changed) return;
    await options.onChanged?.();
    if (!observesMembershipChanges) await pushConnected();
  };

  return {
    start(): void {
      if (started) return;
      started = true;
      options.transport.onMessage(MEMBERSHIP_PROTOCOL, (from, frame) => { void receive(from, frame); });
      options.transport.onPeerConnected((peerId) => { void push(peerId); });
      if (options.identity.onMembershipChanged) {
        observesMembershipChanges = true;
        unsubscribeMembership = options.identity.onMembershipChanged(() => { void pushConnected(); });
      }
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
  const presentation = message.senderPresentation;
  const records = message.signedPeerRecords ?? [];
  const payload = concatBytes([
    ...admitted.map((peerId) => bytesField(1, peerIdToMultihashBytes(peerId))),
    ...revoked.map((peerId) => bytesField(2, peerIdToMultihashBytes(peerId))),
    ...(presentation ? [encodeSenderPresentation(presentation)] : []),
    ...records.map(encodePeerRecord),
  ]);
  if (payload.length > maximumBytes) throw new Error("membership_frame_too_large");
  return concatBytes([varint(BigInt(payload.length)), payload]);
}

export function decodeMembershipFrame(frame: Uint8Array, maximumBytes = MEMBERSHIP_MAX_FRAME_BYTES): MembershipMessage | null {
  const prefix = readVarint(frame, 0);
  if (!prefix || prefix.value > BigInt(maximumBytes) || prefix.value !== BigInt(frame.length - prefix.next)) return null;
  const fields = readFields(frame.slice(prefix.next), new Set([1, 2, 3, 5]));
  if (!fields) return null;
  try {
    const admittedPeerIds = canonicalPeerIds((fields.get(1) ?? []).map((field) => peerIdFromMultihashBytes(field as Uint8Array)));
    const revokedPeerIds = canonicalPeerIds((fields.get(2) ?? []).map((field) => peerIdFromMultihashBytes(field as Uint8Array)));
    const encodedPeerRecords = fields.get(5) ?? [];
    const signedPeerRecords = encodedPeerRecords
      .map((field) => field instanceof Uint8Array ? decodePeerRecord(field) : null)
      .filter((record): record is MembershipPeerRecord => Boolean(record));
    if (signedPeerRecords.length !== encodedPeerRecords.length) {
      log.warn("Membership Signed Peer Record ignored", { reason: "invalid_entry" });
    }
    const senderPresentation = decodeSenderPresentation(singleBytes(fields, 3));
    return {
      admittedPeerIds,
      revokedPeerIds,
      ...(senderPresentation ? { senderPresentation } : {}),
      signedPeerRecords,
    };
  } catch { return null; }
}

function canonicalPeerIds(peerIds: string[]): string[] {
  if (!Array.isArray(peerIds)) throw new Error("invalid_membership_view");
  const canonical = peerIds.map((peerId) => {
    const bytes = peerIdToMultihashBytes(peerId);
    return peerIdFromMultihashBytes(bytes);
  });
  return [...new Set(canonical)].sort((left, right) => compareBytes(
    peerIdToMultihashBytes(left),
    peerIdToMultihashBytes(right),
  ));
}
function encodePeerRecord(record: MembershipPeerRecord): Uint8Array {
  if (!record.envelope.length) throw new Error("invalid_peer_record");
  return bytesField(5, concatBytes([bytesField(1, peerIdToMultihashBytes(record.peerId)), bytesField(2, record.envelope)]));
}
function decodePeerRecord(bytes: Uint8Array): MembershipPeerRecord | null {
  const fields = readFields(bytes, new Set([1, 2]));
  const peerId = fields && singleBytes(fields, 1);
  const envelope = fields && singleBytes(fields, 2);
  if (!peerId || !envelope?.length) return null;
  try { return { peerId: peerIdFromMultihashBytes(peerId), envelope }; } catch { return null; }
}
function decodeSenderPresentation(bytes: Uint8Array | null): MembershipSenderPresentation | undefined {
  if (!bytes) return undefined;
  const fields = readFields(bytes, new Set([1, 2]));
  if (!fields) return undefined;
  const name = singleBytes(fields, 1);
  const revision = singleVarint(fields, 2);
  if (!name || revision === undefined) return undefined;
  let decodedName = "";
  try {
    decodedName = new TextDecoder("utf-8", { fatal: true }).decode(name);
  } catch {
    // The valid monotonic revision still advances while invalid presentation is ignored.
  }
  return {
    deviceName: normalizeDeviceName(decodedName) ?? "",
    nameRevision: revision,
  };
}
function encodeSenderPresentation(presentation: MembershipSenderPresentation): Uint8Array {
  const name = normalizeDeviceName(presentation.deviceName);
  if (!name || presentation.nameRevision < 0n) throw new Error("invalid_membership_view");
  return bytesField(3, concatBytes([
    bytesField(1, new TextEncoder().encode(name)),
    varintField(2, presentation.nameRevision),
  ]));
}
function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}
function concatBytes(parts: Uint8Array[]): Uint8Array { const length = parts.reduce((total, part) => total + part.length, 0); const result = new Uint8Array(length); let at = 0; for (const part of parts) { result.set(part, at); at += part.length; } return result; }
function bytesField(field: number, value: Uint8Array): Uint8Array { return concatBytes([varint(BigInt((field << 3) | 2)), varint(BigInt(value.length)), value]); }
function varintField(field: number, value: bigint): Uint8Array { return concatBytes([varint(BigInt(field << 3)), varint(value)]); }
function varint(value: bigint): Uint8Array { if (value < 0n || value > (1n << 64n) - 1n) throw new Error("invalid_varint"); const out: number[] = []; do { const byte = Number(value & 127n); value >>= 7n; out.push(value ? byte | 128 : byte); } while (value); return Uint8Array.from(out); }
function readVarint(bytes: Uint8Array, start: number): { value: bigint; next: number } | null { let value = 0n; for (let index = start, shift = 0n; index < bytes.length && index < start + 10; index += 1, shift += 7n) { const byte = bytes[index]; value |= BigInt(byte & 127) << shift; if ((byte & 128) === 0) { const next = index + 1; return varint(value).length === next - start ? { value, next } : null; } } return null; }
function readFields(bytes: Uint8Array, recognized: Set<number>): Map<number, Array<Uint8Array | bigint>> | null { const result = new Map<number, Array<Uint8Array | bigint>>(); for (let offset = 0; offset < bytes.length;) { const key = readVarint(bytes, offset); if (!key || key.value === 0n || key.value > BigInt(Number.MAX_SAFE_INTEGER)) return null; offset = key.next; const field = Number(key.value >> 3n); const wire = Number(key.value & 7n); let value: Uint8Array | bigint; if (wire === 0) { const parsed = readVarint(bytes, offset); if (!parsed) return null; value = parsed.value; offset = parsed.next; } else if (wire === 2) { const length = readVarint(bytes, offset); if (!length || length.value > BigInt(bytes.length - length.next)) return null; const end = length.next + Number(length.value); value = bytes.slice(length.next, end); offset = end; } else return null; if (recognized.has(field)) result.set(field, [...(result.get(field) ?? []), value]); } return result; }
function singleBytes(fields: Map<number, Array<Uint8Array | bigint>>, field: number): Uint8Array | null { const values = fields.get(field); return values?.length === 1 && values[0] instanceof Uint8Array ? values[0] : null; }
function singleVarint(fields: Map<number, Array<Uint8Array | bigint>>, field: number): bigint | undefined { const values = fields.get(field); return values?.length === 1 && typeof values[0] === "bigint" ? values[0] : undefined; }
