import { multiaddr } from "@multiformats/multiaddr";
import { closeMessageStream, writeMessageStream } from "./messageStream.js";
import { ensureLegacyMultiaddrApi } from "./multiaddrCompat.js";
import {
  normalizeRelayAuthResponse,
  RelayOperationError,
  type ManagedRelayConnection,
  type ManagedRelayReservation,
} from "./managedRelays.js";

const AUTH = "/clipp/relay-auth/1.0.0";
const RV2 = "/clipp/rendezvous/2.0.0";
const RV1 = "/clipp/rendezvous/1.0.0";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function concat(chunks: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function frame(data: Uint8Array): Uint8Array {
  const head: number[] = [];
  let size = data.length;
  while (size >= 128) {
    head.push((size & 127) | 128);
    size = Math.floor(size / 128);
  }
  head.push(size);
  return concat([Uint8Array.from(head), data], head.length + data.length);
}

async function response(
  stream: any,
  framed: boolean,
  limit: number
): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  let expected = -1;
  let offset = 0;
  for await (const chunk of stream) {
    const bytes = Uint8Array.from(chunk.subarray?.() ?? chunk);
    length += bytes.length;
    if (length > limit + 10) throw new Error("relay_response_too_large");
    chunks.push(bytes);
    const data = concat(chunks, length);
    if (framed && expected < 0) {
      let value = 0;
      let shift = 0;
      for (let i = 0; i < Math.min(data.length, 10); i++) {
        value += (data[i] & 127) * 2 ** shift;
        if ((data[i] & 128) === 0) {
          expected = value;
          offset = i + 1;
          break;
        }
        shift += 7;
      }
      if (expected > limit) throw new Error("relay_response_too_large");
    }
    if (framed && expected >= 0 && data.length - offset >= expected) break;
    if (!framed && data.length > 0) {
      try {
        return JSON.parse(decoder.decode(data)) as Record<string, unknown>;
      } catch {
        /* more data */
      }
    }
  }
  const data = concat(chunks, length);
  if (framed && (expected < 0 || data.length - offset !== expected))
    throw new Error("invalid_relay_frame");
  const result = JSON.parse(
    decoder.decode(framed ? data.subarray(offset) : data)
  );
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("invalid_relay_response");
  return result;
}

function operationError(value: Record<string, unknown>): never {
  const code =
    typeof value.code === "string" ? value.code : "temporarily_unavailable";
  if (
    [
      "invalid_credentials",
      "quota_exhausted",
      "session_limit_exceeded",
      "unsupported_protocol",
      "temporarily_unavailable",
      "rate_limited",
      "authentication_failed",
    ].includes(code)
  )
    throw new RelayOperationError(
      code as ConstructorParameters<typeof RelayOperationError>[0],
      typeof value.retryAfterMillis === "number"
        ? value.retryAfterMillis
        : undefined
    );
  throw new Error("relay_operation_failed");
}

async function exchange(
  connection: any,
  protocol: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
  framed = true
): Promise<Record<string, unknown>> {
  const stream = await connection.newStream(protocol, { signal });
  try {
    const data = encoder.encode(JSON.stringify(payload));
    await writeMessageStream(stream, framed ? frame(data) : data);
    if (protocol === AUTH) await stream.closeWrite?.();
    const value = await response(stream, framed, framed ? 32_768 : 131_072);
    if (value.ok !== true) operationError(value);
    return value;
  } finally {
    await closeMessageStream(stream, { ignoreClosedDataChannel: true }).catch(
      () => undefined
    );
  }
}

type Owned = ManagedRelayConnection & { raw: any; address: string };

/** Host operations used by each runtime adapter on the already-running Device Identity host. */
export function createManagedRelayHost(
  node: any,
  signedPeerRecord: () => Promise<Uint8Array>,
  onConnectionClosed?: (connection: ManagedRelayConnection) => void
) {
  const owned = new Set<Owned>();
  const listeners = new Map<Owned, any>();
  const rendezvousVersions = new Map<Owned, 2 | 1>();
  node.addEventListener?.("connection:close", (event: any) => {
    const connection = [...owned].find(
      (candidate) => candidate.raw === event?.detail
    );
    if (connection) {
      owned.delete(connection);
      onConnectionClosed?.(connection);
    }
  });
  const asOwned = (connection: ManagedRelayConnection): Owned => {
    if (!owned.has(connection as Owned))
      throw new Error("relay_connection_not_owned");
    return connection as Owned;
  };
  return {
    supportsAddress(address: string): boolean {
      return (
        /\/tcp\/\d+(?:\/ws|\/wss)?\/p2p\//.test(address) ||
        /\/udp\/\d+\/webrtc-direct\/certhash\//.test(address)
      );
    },
    async dial(
      address: string,
      signal: AbortSignal
    ): Promise<ManagedRelayConnection> {
      const before = new Set(node.getConnections?.() ?? []);
      const raw = await node.dial(
        ensureLegacyMultiaddrApi(multiaddr(address)),
        { signal, force: true }
      );
      if (before.has(raw) || !raw?.remotePeer)
        throw new Error("relay_connection_not_new");
      const connection: Owned = {
        raw,
        address,
        verifiedPeerId: raw.remotePeer.toString(),
        initialAuthDeadlineMs: Date.now() + 9_000,
        async close() {
          owned.delete(connection);
          rendezvousVersions.delete(connection);
          await raw.close();
        },
      };
      owned.add(connection);
      return connection;
    },
    async authenticate(
      connection: ManagedRelayConnection,
      token: string,
      signal: AbortSignal
    ) {
      const value = await exchange(
        asOwned(connection).raw,
        AUTH,
        { accessToken: token },
        signal
      );
      return normalizeRelayAuthResponse(value);
    },
    async reserve(
      connection: ManagedRelayConnection,
      signal: AbortSignal
    ): Promise<ManagedRelayReservation> {
      const current = asOwned(connection);
      const manager = node.components?.transportManager;
      if (!manager?.listen) throw new Error("relay_reservation_unavailable");
      const store = manager
        .getTransports?.()
        .find(
          (candidate: any) =>
            candidate?.[Symbol.toStringTag] ===
            "@libp2p/circuit-relay-v2-transport"
        )?.reservationStore;
      if (!store?.addEventListener)
        throw new Error("relay_reservation_verification_unavailable");
      const before = new Set(node.getMultiaddrs?.().map(String) ?? []);
      const existing = new Set(manager.getListeners?.() ?? []);
      let matchedConnection = false;
      const onReservation = (event: any) => {
        const detail = event?.detail;
        if (
          detail?.relay?.toString?.() === current.verifiedPeerId &&
          detail?.details?.type === "configured" &&
          detail?.details?.connection === current.raw.id
        )
          matchedConnection = true;
      };
      store.addEventListener("relay:created-reservation", onReservation);
      try {
        await manager.listen(
          [
            ensureLegacyMultiaddrApi(
              multiaddr(`${current.address}/p2p-circuit`)
            ),
          ],
          { signal }
        );
      } finally {
        store.removeEventListener?.("relay:created-reservation", onReservation);
      }
      const created = (manager.getListeners?.() ?? []).find(
        (candidate: any) =>
          !existing.has(candidate) &&
          candidate.constructor?.name === "CircuitRelayTransportListener"
      );
      if (
        !matchedConnection ||
        !created ||
        !(node.getMultiaddrs?.() ?? [])
          .map(String)
          .some(
            (address: string) =>
              !before.has(address) &&
              address.includes(`${current.verifiedPeerId}/p2p-circuit`)
          )
      ) {
        await created?.close?.();
        throw new Error("relay_reservation_failed");
      }
      listeners.set(current, created);
      return {
        release: async () => {
          if (listeners.get(current) !== created) return;
          listeners.delete(current);
          await created.close();
          await node.peerStore?.merge?.(current.raw.remotePeer, {
            tags: { "keep-alive-circuit-relay": undefined },
          });
        },
      };
    },
    async register(
      connection: ManagedRelayConnection,
      record: Uint8Array,
      version: 2 | 1,
      signal: AbortSignal
    ): Promise<void> {
      const current = asOwned(connection);
      const payload = {
        action: "register",
        topic: "clipp",
        signedPeerRecord:
          version === 2 ? base64url(record) : Array.from(record),
      };
      try {
        await exchange(
          current.raw,
          version === 2 ? RV2 : RV1,
          payload,
          signal,
          version === 2
        );
        rendezvousVersions.set(current, version);
      } catch (error) {
        if (
          version === 2 &&
          /unsupported protocol|protocol.*not supported/i.test(String(error))
        )
          throw new RelayOperationError("unsupported_protocol");
        throw error;
      }
    },
    async unregister(
      connection: ManagedRelayConnection,
      signal: AbortSignal
    ): Promise<void> {
      const current = asOwned(connection);
      const version = rendezvousVersions.get(current) ?? 2;
      await exchange(
        current.raw,
        version === 2 ? RV2 : RV1,
        { action: "unregister", topic: "clipp" },
        signal,
        version === 2
      );
      rendezvousVersions.delete(current);
    },
    signedPeerRecord,
  };
}
