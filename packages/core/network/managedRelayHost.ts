import { multiaddr } from "@multiformats/multiaddr";
import { closeMessageStream, writeMessageStream } from "./messageStream.js";
import { decodeSignedPeerRecordBytes } from "./peerRecords.js";
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
    // Subscribe before ending the request: a fast reply can finish its stream
    // before a later async iterator has attached its read/close listeners.
    const received = response(stream, framed, framed ? 32_768 : 131_072);
    void received.catch(() => undefined);
    const data = encoder.encode(JSON.stringify(payload));
    await writeMessageStream(stream, framed ? frame(data) : data);
    if (protocol === AUTH) {
      // Current libp2p close() ends only the writable side. The relay waits
      // for request EOF before authenticating; older streams use closeWrite().
      if (typeof stream.closeWrite === "function") await stream.closeWrite();
      else await stream.close({ signal });
    }
    const value = await received;
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
  // Stock listener.close() clears every reservation in the shared store.
  // Keep released listeners idle for reuse; host shutdown closes them together.
  const idleListeners: any[] = [];
  const parkListener = (listener: any) => {
    // The installed libp2p listener has no per-relay close API: close()
    // cancels the entire shared reservation store. Clear only this listener's
    // observed addresses before it can be reused for another relay.
    for (const address of listener.getAddrs?.() ?? [])
      listener.addressManager?.removeObservedAddr?.(address);
    if (Array.isArray(listener.listeningAddrs)) listener.listeningAddrs = [];
    listener.safeDispatchEvent?.("listening");
    if (!idleListeners.includes(listener)) idleListeners.push(listener);
  };
  const rendezvousVersions = new Map<Owned, 2 | 1>();
  const reservationCleanup = new Map<Owned, () => void>();
  const registrationTimers = new Map<Owned, ReturnType<typeof setTimeout>>();
  const cancelRegistration = (connection: Owned) => {
    const timer = registrationTimers.get(connection);
    if (timer) clearTimeout(timer);
    registrationTimers.delete(connection);
  };
  const cleanup = (connection: Owned) => {
    cancelRegistration(connection);
    reservationCleanup.get(connection)?.();
    reservationCleanup.delete(connection);
  };
  const scheduleRegistration = (
    connection: Owned,
    version: 1 | 2,
    leaseExpiresAt?: unknown,
    retryMs?: number
  ) => {
    cancelRegistration(connection);
    if (!owned.has(connection) || !listeners.has(connection)) return;
    const remaining =
      typeof leaseExpiresAt === "string"
        ? Date.parse(leaseExpiresAt) - Date.now()
        : NaN;
    const delay =
      retryMs ??
      (Number.isFinite(remaining)
        ? Math.max(1_000, Math.min(30_000, remaining / 2))
        : 30_000);
    const timer = setTimeout(() => {
      registrationTimers.delete(connection);
      if (
        !owned.has(connection) ||
        !listeners.has(connection) ||
        !rendezvousVersions.has(connection)
      )
        return;
      void (async () => {
        try {
          const record = await signedPeerRecord();
          if (!owned.has(connection) || !listeners.has(connection)) return;
          const result = await exchange(
            connection.raw,
            version === 2 ? RV2 : RV1,
            {
              action: "register",
              topic: "clipp",
              signedPeerRecord:
                version === 2 ? base64url(record) : Array.from(record),
            },
            AbortSignal.timeout(8_000),
            version === 2
          );
          scheduleRegistration(connection, version, result.leaseExpiresAt);
        } catch {
          scheduleRegistration(connection, version, undefined, 5_000);
        }
      })();
    }, delay);
    timer.unref?.();
    registrationTimers.set(connection, timer);
  };
  node.addEventListener?.("connection:close", (event: any) => {
    const connection = [...owned].find(
      (candidate) => candidate.raw === event?.detail
    );
    if (connection) {
      cleanup(connection);
      owned.delete(connection);
      rendezvousVersions.delete(connection);
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
        /\/tcp\/\d+(?:\/ws|\/wss|\/tls\/(?:sni\/[^/]+\/)?ws)?\/p2p\//.test(
          address
        ) || /\/udp\/\d+\/webrtc-direct\/certhash\//.test(address)
      );
    },
    async dial(
      address: string,
      signal: AbortSignal
    ): Promise<ManagedRelayConnection> {
      if (signal.aborted) throw new Error("relay_dial_aborted");
      const before = new Set(node.getConnections?.() ?? []);
      const raw = await node.dial(
        ensureLegacyMultiaddrApi(multiaddr(address)),
        { signal, force: true }
      );
      if (signal.aborted) {
        if (
          !before.has(raw) &&
          ![...owned].some((connection) => connection.raw === raw)
        )
          await raw.close().catch(() => undefined);
        throw new Error("relay_dial_aborted");
      }
      // Same-peer libp2p dials can resolve to the same physical connection.
      // Give it one owner; otherwise loser cleanup would close the winner.
      if (
        before.has(raw) ||
        !raw?.remotePeer ||
        [...owned].some((connection) => connection.raw === raw)
      )
        throw new Error("relay_connection_not_new");
      let closed = false;
      const connection: Owned = {
        raw,
        address,
        verifiedPeerId: raw.remotePeer.toString(),
        initialAuthDeadlineMs: Date.now() + 9_000,
        async close() {
          if (closed) return;
          cleanup(connection);
          await raw.close();
          closed = true;
          owned.delete(connection);
          rendezvousVersions.delete(connection);
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
      const reused = idleListeners.pop();
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
      let listenError: unknown;
      try {
        const listenAddress = ensureLegacyMultiaddrApi(
          multiaddr(`${current.address}/p2p-circuit`)
        );
        if (reused) await reused.listen(listenAddress);
        else await manager.listen([listenAddress], { signal });
      } catch (error) {
        listenError = error;
      } finally {
        store.removeEventListener?.("relay:created-reservation", onReservation);
      }
      const created =
        reused ??
        (manager.getListeners?.() ?? []).find(
          (candidate: any) =>
            !existing.has(candidate) &&
            // Class names change in minified Android/extension bundles. The
            // listener's store identifies its circuit transport even when a
            // failed listen has not published any addresses yet.
            candidate.reservationStore === store
        );
      if (
        listenError ||
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
        await current.close();
        if (created) parkListener(created);
        if (listenError) throw listenError;
        throw new Error("relay_reservation_failed");
      }
      let removalTimer: ReturnType<typeof setTimeout> | undefined;
      const matchesReservation = (event: any) =>
        event?.detail?.relay?.toString?.() === current.verifiedPeerId &&
        event.detail.details?.type === "configured" &&
        event.detail.details?.connection === current.raw.id;
      const renewed = (event: any) => {
        if (!owned.has(current) || !matchesReservation(event)) return;
        if (removalTimer) clearTimeout(removalTimer);
        removalTimer = undefined;
        // The installed configured listener ignores creation events after its
        // first listen(), so renewal otherwise leaves its advertised addresses
        // empty. Restore only a reservation on this authenticated connection.
        created.addedRelay?.(event.detail);
        const version = rendezvousVersions.get(current);
        if (version) scheduleRegistration(current, version, undefined, 0);
      };
      const removed = (event: any) => {
        if (!matchesReservation(event)) return;
        cancelRegistration(current);
        if (removalTimer) clearTimeout(removalTimer);
        // addRelay removes the old reservation before refreshing it. Give the
        // five-second libp2p reservation attempt time to finish; a real loss
        // closes ownership and lets the controller reconnect.
        removalTimer = setTimeout(() => {
          void current.close().catch(() => undefined);
        }, 6_000);
        removalTimer.unref?.();
      };
      store.addEventListener("relay:created-reservation", renewed);
      store.addEventListener("relay:removed", removed);
      reservationCleanup.set(current, () => {
        if (removalTimer) clearTimeout(removalTimer);
        store.removeEventListener?.("relay:created-reservation", renewed);
        store.removeEventListener?.("relay:removed", removed);
      });
      listeners.set(current, created);
      return {
        release: async () => {
          if (listeners.get(current) !== created) return;
          try {
            await node.peerStore?.merge?.(current.raw.remotePeer, {
              tags: { "keep-alive-circuit-relay": undefined },
            });
          } catch {
            // Releasing this connection is more important than clearing its tag.
          }
          await current.close();
          listeners.delete(current);
          parkListener(created);
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
        const result = await exchange(
          current.raw,
          version === 2 ? RV2 : RV1,
          payload,
          signal,
          version === 2
        );
        rendezvousVersions.set(current, version);
        scheduleRegistration(current, version, result.leaseExpiresAt);
      } catch (error) {
        if (
          version === 2 &&
          /unsupported protocol|protocol.*not supported/i.test(String(error))
        )
          throw new RelayOperationError("unsupported_protocol");
        throw error;
      }
    },
    /** Exact lookup reuses the authenticated session that owns registration. */
    async lookupPeer(
      peerId: string,
      signal: AbortSignal
    ): Promise<Uint8Array | undefined> {
      for (const [connection, version] of rendezvousVersions) {
        signal.throwIfAborted();
        if (!owned.has(connection) || connection.raw.status !== "open")
          continue;
        try {
          const result = await exchange(
            connection.raw,
            version === 2 ? RV2 : RV1,
            { action: "lookup", topic: "clipp", peerId },
            signal,
            version === 2
          );
          if (!owned.has(connection) || !rendezvousVersions.has(connection))
            continue;
          const record = result.record as
            { peer?: unknown; signedPeerRecord?: unknown } | undefined;
          if (record?.peer !== peerId) continue;
          if (version === 1) {
            const bytes = decodeSignedPeerRecordBytes(record.signedPeerRecord);
            if (bytes) return bytes;
          } else if (
            typeof record.signedPeerRecord === "string" &&
            /^[A-Za-z0-9_-]+$/.test(record.signedPeerRecord)
          ) {
            const encoded = record.signedPeerRecord
              .replace(/-/g, "+")
              .replace(/_/g, "/");
            const binary = atob(
              encoded + "=".repeat((4 - (encoded.length % 4)) % 4)
            );
            if (binary.length)
              return Uint8Array.from(binary, (character) =>
                character.charCodeAt(0)
              );
          }
        } catch {
          signal.throwIfAborted();
          // Another owned relay can still supply fresh reachability.
        }
      }
      return undefined;
    },
    async unregister(
      connection: ManagedRelayConnection,
      signal: AbortSignal
    ): Promise<void> {
      const current = asOwned(connection);
      cancelRegistration(current);
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
