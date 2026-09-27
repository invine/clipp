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
  private readonly registered = new Set<string>();

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
    const relays = this.relays;
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
    const options = this.rendezvousOptions();
    await Promise.allSettled(
      registered.map((relay) =>
        unregisterFromRendezvous(node, relay, this.topic(), options),
      ),
    );
    await this.closeRelayListeners(node, relays);
    await this.closeRelayConnections(node, relays);
  }

  /** Replaces only relay-owned work; direct connections and the host remain live. */
  async reconfigure(node: any, relays: string[]): Promise<void> {
    await this.stop();
    await this.start(node, relays);
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
        const connection = await node.dial(
          ensureLegacyMultiaddrApi(multiaddr(addr)),
          this.dialOptions(),
        );
        if (!this.isCurrent(generation)) {
          try {
            await connection?.close?.();
          } catch {
            /* best effort */
          }
          return;
        }
      } catch (err: any) {
        log.warn("Relay dial failed", { addr, error: err?.message || err });
      }
    }
  }

  private hasReservation(relay: string): boolean {
    const prefix = `${relay.replace(/\/+$/, "")}/p2p-circuit`;
    return this.selfMultiaddrs().some((addr) => addr.startsWith(prefix));
  }

  private async ensureReservations(generation: number): Promise<void> {
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
      await this.closeEmptyRelayListeners(node);
      if (!this.isCurrent(generation)) return;
      log.info("Ensuring relay reservations", { relays: circuitAddrs });
      await manager.listen(
        circuitAddrs.map((addr) => ensureLegacyMultiaddrApi(multiaddr(addr))),
      );
      if (!this.isCurrent(generation)) {
        await this.closeRelayListeners(node, relays);
        return;
      }
      const stillMissing = relays.filter(
        (relay) => !this.hasReservation(relay),
      );
      if (stillMissing.length > 0) {
        await this.closeEmptyRelayListeners(node);
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

  private async closeEmptyRelayListeners(node: any): Promise<void> {
    const listeners = node.components?.transportManager?.getListeners?.() ?? [];
    await Promise.all(
      listeners
        .filter(
          (listener: any) =>
            listener?.constructor?.name === "CircuitRelayTransportListener",
        )
        .filter((listener: any) => {
          try {
            return (listener.getAddrs?.() ?? []).length === 0;
          } catch {
            return false;
          }
        })
        .map(async (listener: any) => {
          try {
            await listener.close?.();
          } catch {
            /* best effort */
          }
        }),
    );
  }

  private async closeRelayListeners(
    node: any,
    relays: string[],
  ): Promise<void> {
    const listeners = node.components?.transportManager?.getListeners?.() ?? [];
    await Promise.all(
      listeners
        .filter(
          (listener: any) =>
            listener?.constructor?.name === "CircuitRelayTransportListener",
        )
        .filter((listener: any) => {
          try {
            const addrs = (listener.getAddrs?.() ?? []).map(String);
            return (
              addrs.length === 0 ||
              addrs.some((addr: string) =>
                relays.some((relay) => addr.startsWith(`${relay}/p2p-circuit`)),
              )
            );
          } catch {
            return false;
          }
        })
        .map(async (listener: any) => {
          try {
            await listener.close?.();
          } catch {
            /* best effort */
          }
        }),
    );
  }

  private async closeRelayConnections(
    node: any,
    relays: string[],
  ): Promise<void> {
    const peerIds = new Set(
      relays.map((relay) => relay.split("/p2p/").pop()).filter(Boolean),
    );
    const connections = node.getConnections?.() ?? [];
    await Promise.all(
      connections
        .filter((connection: any) =>
          peerIds.has(connection?.remotePeer?.toString?.()),
        )
        .map(async (connection: any) => {
          try {
            await connection.close?.();
          } catch {
            /* best effort */
          }
        }),
    );
  }

  private triggerRendezvous(generation: number): void {
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
    void this.runRendezvous(generation).finally(() => {
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

  private async runRendezvous(generation: number): Promise<void> {
    const node = this.node;
    if (!node?.peerId?.toString?.()) return;
    const options = this.rendezvousOptions();
    try {
      for (const relay of this.relays) {
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
