import { multiaddr } from "@multiformats/multiaddr";
import { ensureLegacyMultiaddrApi } from "./multiaddrCompat.js";
import {
  lookupRendezvousPeer,
  registerOnRendezvous,
  unregisterFromRendezvous,
} from "./rendezvous.js";
import * as log from "../logger.js";

type RelayLifecycleOptions = {
  enableRelayReservations?: boolean;
  enableRendezvous?: boolean;
  rendezvousTopic?: string;
  rendezvousIntervalMs?: number;
  rendezvousTimeoutMs?: number;
  relayReservationRetryMs?: number;
  dialTimeoutMs?: number;
};

/** Owns relay work on an existing Device Identity host. It never starts or stops the host. */
export class RelayLifecycle {
  private node: any = null;
  private relays: string[] = [];
  private generation = 0;
  private ready = false;
  private rendezvousTimer: ReturnType<typeof setTimeout> | null = null;
  private reservationTimer: ReturnType<typeof setInterval> | null = null;
  private rendezvousRunning = false;
  private rendezvousPending = false;
  private reservationRunning = false;
  private reservationWork: Promise<void> = Promise.resolve();
  private readonly registered = new Set<string>();
  private readonly ownedConnections = new Map<string, Set<any>>();
  private readonly relayPeers = new Map<string, any>();
  private readonly pendingReconnect = new Set<string>();
  private readonly relayListenersByAddress = new Map<string, any>();
  private readonly closedListeners = new WeakSet<object>();

  constructor(
    private readonly options: RelayLifecycleOptions,
    private readonly selfMultiaddrs: () => string[],
    private readonly signedPeerRecord: () => Promise<Uint8Array>,
    private readonly reachabilityChanged: () => void,
  ) {}

  async start(node: any, relays: string[]): Promise<void> {
    if (this.node) return;
    this.node = node;
    this.relays = [...relays];
    this.observeRelayConnections(node);
    this.ready = false;
    const generation = ++this.generation;
    log.info("Relay reservation setup", {
      configuredRelays: relays,
      circuitRelays: relays,
      enableRelayReservations: this.options.enableRelayReservations !== false,
    });
    await this.connectRelays(node, relays, generation);
    if (!this.isCurrent(generation)) return;
    await this.ensureReservations(generation);
    if (!this.isCurrent(generation)) return;
    if (this.options.enableRelayReservations !== false && relays.length > 0) {
      this.reservationTimer = setInterval(() => {
        void this.ensureReservations(generation);
      }, this.options.relayReservationRetryMs ?? 15_000);
    }
    this.ready = true;
    this.triggerRendezvous(generation);
  }

  async stop(): Promise<void> {
    const node = this.node;
    const relays = [...this.relays];
    ++this.generation;
    this.node = null;
    this.relays = [];
    this.ready = false;
    this.rendezvousPending = false;
    this.rendezvousRunning = false;
    this.reservationRunning = false;
    if (this.rendezvousTimer) clearTimeout(this.rendezvousTimer);
    if (this.reservationTimer) clearInterval(this.reservationTimer);
    this.rendezvousTimer = null;
    this.reservationTimer = null;
    const registered = [...this.registered];
    this.registered.clear();
    if (!node) return;
    this.unobserveRelayConnections(node);
    const options = this.rendezvousOptions();
    await Promise.allSettled(
      registered.map((relay) =>
        unregisterFromRendezvous(node, relay, this.topic(), options),
      ),
    );
    await this.closeListeners(this.relayListeners(node));
    this.relayListenersByAddress.clear();
    await this.clearRelayKeepAlive(node, relays);
    await this.closeRelayConnections(relays);
    this.relayPeers.clear();
  }

  reachabilityUpdated(): void {
    this.triggerRendezvous(this.generation);
  }

  async lookupPeer(
    peerId: string,
    accept: (peer: string, record: Uint8Array) => Promise<boolean>,
  ): Promise<void> {
    const node = this.node;
    const generation = this.generation;
    if (!node) return;
    for (const relay of this.relays) {
      if (!this.isCurrent(generation)) return;
      let records: Awaited<ReturnType<typeof lookupRendezvousPeer>> = [];
      try {
        records = await lookupRendezvousPeer(
          node,
          relay,
          this.topic(),
          peerId,
          this.rendezvousOptions(),
        );
      } catch (error) {
        log.debug("Rendezvous lookup relay unavailable", {
          peerId,
          relay,
          error: (error as Error)?.message,
        });
        continue;
      }
      for (const record of records) {
        if (!this.isCurrent(generation)) return;
        if (await accept(record.peer, record.signedPeerRecord)) return;
      }
    }
  }

  private isCurrent(generation: number): boolean {
    return this.node !== null && this.generation === generation;
  }

  private topic(): string {
    return this.options.rendezvousTopic ?? "clipp";
  }

  private dialOptions(): {
    runOnLimitedConnection: true;
    signal?: AbortSignal;
  } {
    const timeout = this.options.dialTimeoutMs ?? 12_000;
    const supportsTimeout =
      typeof AbortSignal !== "undefined" &&
      typeof (AbortSignal as any).timeout === "function";
    return {
      runOnLimitedConnection: true,
      ...(supportsTimeout
        ? { signal: (AbortSignal as any).timeout(timeout) }
        : {}),
    };
  }

  private rendezvousOptions() {
    return {
      timeoutMs:
        this.options.rendezvousTimeoutMs ??
        this.options.dialTimeoutMs ??
        12_000,
      dialOptions: this.dialOptions(),
      log: () => log.debug("Rendezvous client diagnostic"),
    };
  }

  private async connectRelays(
    node: any,
    relays: string[],
    generation: number,
  ): Promise<void> {
    for (const addr of relays) {
      if (!this.isCurrent(generation)) return;
      try {
        const existingConnections = this.connectionSnapshot(node);
        const connection = await node.dial(
          ensureLegacyMultiaddrApi(multiaddr(addr)),
          this.dialOptions(),
        );
        const owned = this.isNewConnection(connection, existingConnections);
        if (!this.isCurrent(generation)) {
          if (owned) await this.closeConnection(connection);
          return;
        }
        if (connection?.remotePeer)
          this.relayPeers.set(addr, connection.remotePeer);
        if (owned) this.rememberConnection(addr, connection);
      } catch (err: any) {
        log.warn("Relay dial failed", { addr, error: err?.message || err });
      }
    }
  }

  private connectionSnapshot(node: any): {
    references: Set<any>;
    ids: Set<any>;
  } {
    const references = new Set<any>(node.getConnections?.() ?? []);
    const ids = new Set(
      [...references]
        .map((connection) => connection?.id)
        .filter((id) => id != null),
    );
    return { references, ids };
  }

  private isNewConnection(
    connection: any,
    before: { references: Set<any>; ids: Set<any> },
  ): boolean {
    return (
      Boolean(connection) &&
      !before.references.has(connection) &&
      (connection.id == null || !before.ids.has(connection.id))
    );
  }

  private rememberConnection(relay: string, connection: any): void {
    const connections = this.ownedConnections.get(relay) ?? new Set<any>();
    connections.add(connection);
    this.ownedConnections.set(relay, connections);
  }

  private relayForPeer(peer: any): string | undefined {
    const id = peer?.toString?.();
    return this.relays.find((relay) => relay.split("/p2p/").pop() === id);
  }

  private readonly onConnectionClose = (event: any): void => {
    const closed = event?.detail;
    for (const [relay, connections] of this.ownedConnections) {
      if (
        connections.has(closed) ||
        (closed?.id != null &&
          [...connections].some((connection) => connection?.id === closed.id))
      ) {
        const peer = closed?.remotePeer?.toString?.();
        const stillConnected = (this.node?.getConnections?.() ?? []).some(
          (connection: any) =>
            connection !== closed &&
            (closed?.id == null || connection?.id !== closed.id) &&
            connection?.remotePeer?.toString?.() === peer,
        );
        if (!stillConnected) this.pendingReconnect.add(relay);
      }
    }
  };

  private readonly onConnectionOpen = (event: any): void => {
    if (!this.node) return;
    const connection = event?.detail;
    const relay = this.relayForPeer(connection?.remotePeer);
    if (!relay || !this.pendingReconnect.delete(relay)) return;
    this.rememberConnection(relay, connection);
  };

  private observeRelayConnections(node: any): void {
    node.addEventListener?.("connection:close", this.onConnectionClose);
    node.addEventListener?.("connection:open", this.onConnectionOpen);
  }

  private unobserveRelayConnections(node: any): void {
    node.removeEventListener?.("connection:close", this.onConnectionClose);
    node.removeEventListener?.("connection:open", this.onConnectionOpen);
    this.pendingReconnect.clear();
  }

  private async clearRelayKeepAlive(
    node: any,
    relays: string[],
  ): Promise<void> {
    await Promise.all(
      relays.map(async (relay) => {
        const peer = this.relayPeers.get(relay);
        if (!peer) return;
        await node.peerStore?.merge?.(peer, {
          tags: { "keep-alive-circuit-relay": undefined },
        });
      }),
    );
  }

  private relayReservationStore(node: any): any {
    const transport = node.components?.transportManager
      ?.getTransports?.()
      ?.find(
        (candidate: any) =>
          candidate?.[Symbol.toStringTag] ===
          "@libp2p/circuit-relay-v2-transport",
      );
    return transport?.reservationStore;
  }

  private hasReservation(relay: string): boolean {
    const prefix = `${relay.replace(/\/+$/, "")}/p2p-circuit`;
    return this.selfMultiaddrs().some((addr) => addr.startsWith(prefix));
  }

  private ensureReservations(generation: number): Promise<void> {
    const work = this.reservationWork.then(() =>
      this.runEnsureReservations(generation),
    );
    this.reservationWork = work.catch(() => undefined);
    return work;
  }

  private async runEnsureReservations(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    const node = this.node;
    const relays = this.relays;
    const selfAddrs = this.selfMultiaddrs();
    const missing = relays.filter((relay) => !this.hasReservation(relay));
    const skipReason = !node
      ? "node_missing"
      : this.options.enableRelayReservations === false
        ? "reservations_disabled"
        : !relays.length
          ? "no_circuit_relays"
          : this.reservationRunning
            ? "reservation_already_running"
            : missing.length === 0
              ? "all_reservations_available"
              : null;
    if (skipReason) {
      log.info("Relay reservation skipped", {
        reason: skipReason,
        relays,
        selfAddrs,
        configuredRelays: relays,
      });
      return;
    }
    const manager = node.components?.transportManager;
    if (typeof manager?.listen !== "function") {
      log.debug(
        "Relay reservation retry skipped: transport manager unavailable",
      );
      return;
    }
    const circuitAddrs = missing.map(
      (relay) => `${relay.replace(/\/+$/, "")}/p2p-circuit`,
    );
    this.reservationRunning = true;
    try {
      log.info("Ensuring relay reservations", { relays: circuitAddrs });
      const activeListeners = new Set(this.relayListeners(node));
      for (const [relay, listener] of this.relayListenersByAddress) {
        if (!activeListeners.has(listener))
          this.relayListenersByAddress.delete(relay);
      }
      const newRelays = missing.filter(
        (relay) => !this.relayListenersByAddress.has(relay),
      );
      const retryRelays = missing.filter((relay) =>
        this.relayListenersByAddress.has(relay),
      );
      const beforeListeners = new Set(this.relayListeners(node));
      const beforeConnections = new Map(
        missing.map((relay) => [relay, this.connectionSnapshot(node)]),
      );
      const opened = new Map<string, Set<any>>();
      const peers = new Map<string, any>();
      const store = this.relayReservationStore(node);
      const onReservation = (event: any) => {
        const { relay: peer, details } = event?.detail ?? {};
        const relay = missing.find(
          (candidate) => candidate.split("/p2p/").pop() === peer?.toString?.(),
        );
        if (
          !relay ||
          details?.type !== "configured" ||
          details.connection == null
        )
          return;
        peers.set(relay, peer);
        const before = beforeConnections.get(relay);
        const connection = (node.getConnections?.() ?? []).find(
          (candidate: any) => candidate?.id === details.connection,
        );
        if (before && connection && this.isNewConnection(connection, before)) {
          const relayConnections = opened.get(relay) ?? new Set();
          relayConnections.add(connection);
          opened.set(relay, relayConnections);
        }
      };
      store?.addEventListener?.("relay:created-reservation", onReservation);
      let listenError: unknown;
      try {
        if (newRelays.length > 0) {
          await manager.listen(
            newRelays.map((relay) =>
              ensureLegacyMultiaddrApi(
                multiaddr(`${relay.replace(/\/+$/, "")}/p2p-circuit`),
              ),
            ),
          );
        }
        await Promise.all(
          retryRelays.map((relay) =>
            this.relayListenersByAddress
              .get(relay)
              ?.listen(
                ensureLegacyMultiaddrApi(
                  multiaddr(`${relay.replace(/\/+$/, "")}/p2p-circuit`),
                ),
              ),
          ),
        );
      } catch (error) {
        listenError = error;
      } finally {
        store?.removeEventListener?.(
          "relay:created-reservation",
          onReservation,
        );
      }
      const created = this.relayListeners(node).filter(
        (listener) => !beforeListeners.has(listener),
      );
      newRelays.forEach((relay, index) => {
        if (created[index])
          this.relayListenersByAddress.set(relay, created[index]);
      });
      if (!this.isCurrent(generation)) {
        await this.closeListeners(
          [
            ...this.relayListeners(node).filter(
              (listener) => !beforeListeners.has(listener),
            ),
            ...retryRelays.map((relay) =>
              this.relayListenersByAddress.get(relay),
            ),
          ].filter(Boolean),
        );
        for (const peer of peers.values()) {
          await node.peerStore?.merge?.(peer, {
            tags: { "keep-alive-circuit-relay": undefined },
          });
        }
        for (const connections of opened.values()) {
          await Promise.all(
            [...connections].map((connection) =>
              this.closeConnection(connection),
            ),
          );
        }
        return;
      }
      for (const [relay, peer] of peers) this.relayPeers.set(relay, peer);
      for (const [relay, connections] of opened) {
        for (const connection of connections)
          this.rememberConnection(relay, connection);
      }
      if (listenError) throw listenError;
      const stillMissing = relays.filter(
        (relay) => !this.hasReservation(relay),
      );
      if (stillMissing.length > 0) {
        log.warn("Relay reservation did not produce all circuit addresses", {
          relays: stillMissing,
        });
      } else {
        log.info("Relay reservation address available", {
          selfAddrs: this.selfMultiaddrs(),
        });
      }
      this.reachabilityChanged();
    } catch (err: any) {
      log.warn("Relay reservation retry failed", {
        relays: circuitAddrs,
        error: err?.message || err,
      });
    } finally {
      if (this.isCurrent(generation)) this.reservationRunning = false;
    }
  }

  private relayListeners(node: any): any[] {
    return (node.components?.transportManager?.getListeners?.() ?? []).filter(
      (listener: any) =>
        listener?.constructor?.name === "CircuitRelayTransportListener",
    );
  }

  private async closeListeners(listeners: any[]): Promise<void> {
    await Promise.all(
      listeners.map(async (listener) => {
        if (this.closedListeners.has(listener)) return;
        this.closedListeners.add(listener);
        try {
          await listener.close?.();
        } catch {
          /* best effort */
        }
      }),
    );
  }

  private async closeRelayConnections(relays: string[]): Promise<void> {
    const toClose = new Set<any>();
    for (const relay of relays) {
      for (const connection of this.ownedConnections.get(relay) ?? [])
        toClose.add(connection);
      this.ownedConnections.delete(relay);
    }
    await Promise.all(
      [...toClose].map((connection) => this.closeConnection(connection)),
    );
  }

  private async closeConnection(connection: any): Promise<void> {
    try {
      await connection.close?.();
    } catch {
      /* best effort */
    }
  }

  private triggerRendezvous(generation: number, targets = this.relays): void {
    if (
      !this.isCurrent(generation) ||
      !this.ready ||
      this.options.enableRendezvous === false ||
      this.relays.length === 0
    )
      return;
    this.updateRefreshSchedule(generation);
    if (this.rendezvousRunning) {
      this.rendezvousPending = true;
      return;
    }
    this.rendezvousRunning = true;
    void this.runRendezvous(generation, targets).finally(() => {
      if (!this.isCurrent(generation)) return;
      this.rendezvousRunning = false;
      if (this.rendezvousPending) {
        this.rendezvousPending = false;
        this.triggerRendezvous(generation);
      } else {
        this.updateRefreshSchedule(generation);
      }
    });
  }

  private updateRefreshSchedule(generation: number): void {
    const shouldRefresh =
      this.isCurrent(generation) &&
      this.relays.some((relay) => this.hasReservation(relay));
    if (!shouldRefresh) {
      if (this.rendezvousTimer) clearTimeout(this.rendezvousTimer);
      this.rendezvousTimer = null;
      return;
    }
    if (this.rendezvousTimer) return;
    const interval = this.options.rendezvousIntervalMs ?? 30_000;
    const jitteredInterval = Math.max(
      1_000,
      Math.round(interval * (0.8 + Math.random() * 0.4)),
    );
    this.rendezvousTimer = setTimeout(() => {
      this.rendezvousTimer = null;
      this.triggerRendezvous(generation);
    }, jitteredInterval);
  }

  private async runRendezvous(
    generation: number,
    targets: string[],
  ): Promise<void> {
    const node = this.node;
    if (!node?.peerId?.toString?.()) return;
    const options = this.rendezvousOptions();
    try {
      for (const relay of targets) {
        if (!this.isCurrent(generation)) return;
        if (this.hasReservation(relay)) {
          const signedRecord = await this.signedPeerRecord();
          if (!this.isCurrent(generation)) return;
          await registerOnRendezvous(
            node,
            relay,
            this.topic(),
            signedRecord,
            options,
          );
          if (!this.isCurrent(generation)) {
            if (!this.relays.includes(relay)) {
              await unregisterFromRendezvous(
                node,
                relay,
                this.topic(),
                options,
              );
            }
            return;
          }
          this.registered.add(relay);
        } else {
          if (this.registered.delete(relay))
            await unregisterFromRendezvous(node, relay, this.topic(), options);
          log.debug(
            "Rendezvous registration skipped: relay reservation unavailable",
            { relay, topic: this.topic() },
          );
        }
      }
    } catch (err: any) {
      log.debug("Rendezvous discovery pass failed", {
        error: err?.message || err,
      });
    }
  }
}
