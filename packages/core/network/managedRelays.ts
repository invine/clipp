import { multiaddr } from "@multiformats/multiaddr";

export type RelayConfiguration =
  | { key: string; name: string; kind: "managed"; discoveryUrl: string }
  | {
      key: string;
      name: string;
      kind: "explicit";
      peerId: string;
      addresses: string[];
    };

export function canonicalDiscoveryUrl(value: string): string {
  if (typeof value !== "string" || !value)
    throw new Error("Invalid discovery URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid discovery URL");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/v1/relay"
  ) {
    throw new Error(
      "Discovery URL must be the exact HTTPS /v1/relay endpoint without credentials, query or fragment"
    );
  }
  return url.href;
}

function isCompleteRelayAddress(
  address: string,
  expectedPeerId: string
): boolean {
  if (
    !address.endsWith(`/p2p/${expectedPeerId}`) ||
    address.includes("/p2p-circuit")
  )
    return false;
  const prefix = address.slice(0, -`/p2p/${expectedPeerId}`.length);
  const match = prefix.match(
    /^\/(?:ip4|ip6|dns|dns4|dns6|dnsaddr)\/[^/]+\/(?:tcp|udp)\/(\d+)(?:\/[^/]+)*$/
  );
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

export function normalizeRelayConfigurations(
  values: unknown
): RelayConfiguration[] {
  if (!Array.isArray(values))
    throw new Error("Relay configurations must be a list");
  const keys = new Set<string>();
  const urls = new Set<string>();
  const peers = new Set<string>();
  return values.map((value): RelayConfiguration => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid relay configuration");
    const raw = value as Record<string, unknown>;
    if (
      typeof raw.key !== "string" ||
      !raw.key.trim() ||
      typeof raw.name !== "string"
    )
      throw new Error("Invalid relay key or name");
    if (keys.has(raw.key)) throw new Error("Duplicate relay key");
    keys.add(raw.key);
    if (raw.kind === "managed") {
      if (
        Object.keys(raw).some(
          (key) => !["key", "name", "kind", "discoveryUrl"].includes(key)
        )
      )
        throw new Error("Mixed or unknown managed relay fields");
      const discoveryUrl = canonicalDiscoveryUrl(raw.discoveryUrl as string);
      if (urls.has(discoveryUrl)) throw new Error("Duplicate discovery URL");
      urls.add(discoveryUrl);
      return { key: raw.key, name: raw.name, kind: "managed", discoveryUrl };
    }
    if (raw.kind === "explicit") {
      if (
        Object.keys(raw).some(
          (key) => !["key", "name", "kind", "peerId", "addresses"].includes(key)
        )
      )
        throw new Error("Mixed or unknown explicit relay fields");
      if (
        typeof raw.peerId !== "string" ||
        !raw.peerId ||
        !Array.isArray(raw.addresses) ||
        raw.addresses.length === 0
      )
        throw new Error("Invalid explicit relay");
      const addresses = raw.addresses.map((address) => {
        if (
          typeof address !== "string" ||
          !isCompleteRelayAddress(address, raw.peerId as string)
        )
          throw new Error(
            "Explicit relay requires a complete dialable address naming its Peer ID"
          );
        try {
          return multiaddr(address).toString();
        } catch {
          throw new Error("Invalid explicit multiaddr");
        }
      });
      if (peers.has(raw.peerId)) throw new Error("Duplicate explicit Peer ID");
      peers.add(raw.peerId);
      return {
        key: raw.key,
        name: raw.name,
        kind: "explicit",
        peerId: raw.peerId,
        addresses: [...new Set(addresses)],
      };
    }
    throw new Error("Unknown relay kind");
  });
}

export type RelayStatus =
  | "connecting"
  | "login_needed"
  | "ready"
  | "degraded"
  | "refused"
  | "retrying"
  | "conflict";
export type RelayTransportFamily = "tcp" | "wss" | "webrtc-direct";
export type RelayTransportState = {
  family: RelayTransportFamily;
  status: RelayStatus;
  reason?: string;
  retryAt?: number;
  reservationOwner: boolean;
};
function transportFamily(address: string): RelayTransportFamily | undefined {
  if (address.includes("/webrtc-direct/")) return "webrtc-direct";
  if (/\/(?:wss|ws)(?:\/|$)/.test(address)) return "wss";
  if (address.includes("/tcp/")) return "tcp";
  return undefined;
}
export type RelayState = {
  key: string;
  name: string;
  kind: RelayConfiguration["kind"];
  status: RelayStatus;
  peerId?: string;
  reason?: string;
  retryAt?: number;
  warning?: string;
  transports?: RelayTransportState[];
};
export type DiscoveryDocument = {
  version: 1;
  relay: { peerId: string; addresses: string[] };
  validUntil: number;
};
/** Converts the Go wire format's UTC RFC3339 timestamp into epoch milliseconds. */
export function parseRelayTimestamp(value: unknown): number {
  if (typeof value !== "string")
    throw new Error("Expected RFC3339 UTC timestamp");
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/
  );
  if (!match) throw new Error("Expected RFC3339 UTC timestamp");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millis = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));
  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millis
  );
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  )
    throw new Error("Invalid RFC3339 UTC timestamp");
  return timestamp;
}

export function normalizeDiscoveryResponse(raw: unknown): DiscoveryDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid discovery response");
  const value = raw as Record<string, unknown>;
  if (
    value.version !== 1 ||
    !value.relay ||
    typeof value.relay !== "object" ||
    Array.isArray(value.relay)
  )
    throw new Error("Invalid discovery response");
  const relay = value.relay as Record<string, unknown>;
  if (
    typeof relay.peerId !== "string" ||
    !Array.isArray(relay.addresses) ||
    !relay.addresses.every((address) => typeof address === "string")
  )
    throw new Error("Invalid discovery response");
  return {
    version: 1,
    relay: { peerId: relay.peerId, addresses: relay.addresses as string[] },
    validUntil: parseRelayTimestamp(value.validUntil),
  };
}

export function normalizeRelayAuthResponse(raw: unknown): RelayAuthResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid relay auth response");
  const value = raw as Record<string, unknown>;
  if (
    value.ok !== true ||
    !Number.isSafeInteger(value.renewAfterMillis) ||
    (value.renewAfterMillis as number) <= 0
  )
    throw new Error("Invalid relay auth response");
  return {
    sessionExpiresAt: parseRelayTimestamp(value.sessionExpiresAt),
    renewAfterMillis: value.renewAfterMillis as number,
  };
}

export type ManagedRelayConnection = {
  verifiedPeerId: string;
  initialAuthDeadlineMs?: number;
  close(): Promise<void>;
};
export type ManagedRelayReservation = {
  /** Actual authenticated connection selected by the stock per-peer reservation store. */
  connection?: ManagedRelayConnection;
  /** Removes this relay listener and its keep-alive/redial ownership before connection closure. */ release(): Promise<void>;
};
export type RelayAuthResult = {
  sessionExpiresAt: number;
  renewAfterMillis: number;
};
export type RelayErrorCode =
  | "invalid_credentials"
  | "quota_exhausted"
  | "session_limit_exceeded"
  | "unsupported_protocol"
  | "temporarily_unavailable"
  | "rate_limited"
  | "authentication_failed";
export class RelayOperationError extends Error {
  constructor(
    public readonly code: RelayErrorCode,
    public readonly retryAfterMillis?: number
  ) {
    super(code);
  }
}
export type ManagedRelayAdapter = {
  accessToken(
    discoveryUrl: string,
    signal: AbortSignal
  ): Promise<string | null>;
  discover(
    discoveryUrl: string,
    accessToken: string,
    signal: AbortSignal
  ): Promise<DiscoveryDocument>;
  supportsAddress(address: string): boolean;
  addressPriority?(address: string): number;
  dial(address: string, signal: AbortSignal): Promise<ManagedRelayConnection>;
  authenticate(
    connection: ManagedRelayConnection,
    accessToken: string,
    signal: AbortSignal
  ): Promise<RelayAuthResult>;
  reserve(
    connection: ManagedRelayConnection,
    signal: AbortSignal
  ): Promise<ManagedRelayReservation>;
  register(
    connection: ManagedRelayConnection,
    signedPeerRecord: Uint8Array,
    version: 2 | 1,
    signal: AbortSignal
  ): Promise<void>;
  signedPeerRecord(): Promise<Uint8Array>;
  eraseCredentials(discoveryUrl: string): Promise<void>;
  interactiveLogin(discoveryUrl: string): Promise<void>;
  openAccount(discoveryUrl: string): Promise<void>;
  unregister(
    connection: ManagedRelayConnection,
    signal: AbortSignal
  ): Promise<void>;
  onStateChange?(states: RelayState[]): void;
};

type Entry = {
  parent?: Entry;
  family?: RelayTransportFamily;
  available?: boolean;
  lanes?: Map<RelayTransportFamily, Entry>;
  owner?: Entry;
  provisioning?: Promise<void>;
  cleanupFlight?: Promise<void>;
  dials?: { active: number; queue: Array<() => void> };
  config: RelayConfiguration;
  state: RelayState;
  generation: number;
  controller: AbortController;
  connection?: ManagedRelayConnection;
  reservation?: ManagedRelayReservation;
  retryTimer?: ReturnType<typeof setTimeout>;
  renewTimer?: ReturnType<typeof setTimeout>;
  authExpiryTimer?: ReturnType<typeof setTimeout>;
  authExpiresAt?: number;
  discoveryTimer?: ReturnType<typeof setTimeout>;
  setupFlight?: Promise<void>;
  attempt: number;
  retryAt: number;
  document?: DiscoveryDocument;
  renewFlight?: Promise<void>;
};
const DEADLINES = {
  discovery: 10_000,
  dial: 20_000,
  auth: 10_000,
  reserve: 15_000,
  rendezvous: 12_000,
  shutdown: 15_000,
} as const;
// Discovery is issued for one minute by the relay's clock. Allow a small
// difference between clocks, while retaining at most one minute locally.
const DISCOVERY_MAX_LIFETIME_MS = 60_000;
const DISCOVERY_CLOCK_TOLERANCE_MS = 5_000;
const RETRY = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

/** Shared managed-relay orchestration. The adapter owns the one existing host and all platform storage. */
export class ManagedRelayController {
  private readonly entries = new Map<string, Entry>();
  private readonly tokenFlights = new Map<string, Promise<string | null>>();
  private readonly peerClaims = new Map<string, Entry>();
  private setupActive = 0;
  private readonly setupOwners = new Map<Entry, number>();
  private readonly setupQueue: Array<() => void> = [];
  private stopped = false;
  private readonly desired = new Map<string, RelayConfiguration>();
  private readonly cleanupByKey = new Map<string, Promise<void>>();
  private readonly cleanupByEndpoint = new Map<string, Promise<void>>();
  constructor(
    private readonly adapter: ManagedRelayAdapter,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = Date.now
  ) {}

  states(): RelayState[] {
    return [...this.entries.values()].map((entry) => {
      const lanes = this.lanes(entry);
      if (!entry.lanes) return { ...entry.state };
      const owner = entry.owner;
      const healthy = owner?.connection && owner.reservation;
      return {
        ...entry.state,
        status: healthy ? owner.state.status : entry.state.status,
        reason: healthy ? owner.state.reason : entry.state.reason,
        retryAt: healthy ? owner.state.retryAt : entry.state.retryAt,
        transports: lanes
          .filter((lane) => lane.available !== false)
          .map((lane) => ({
            family: lane.family!,
            status: lane.state.status,
            reason: lane.state.reason,
            retryAt: lane.state.retryAt,
            reservationOwner: lane === owner,
          })),
      };
    });
  }
  configurations(): RelayConfiguration[] {
    return [...this.entries.values()].map(({ config }) =>
      structuredClone(config)
    );
  }
  /** Filters dial candidates without changing the signed reachability record. Direct routes remain eligible. */
  eligibleDialAddresses(addresses: string[]): string[] {
    const eligible = new Set(
      [...this.entries.values()]
        .filter(
          (entry) =>
            (entry.owner ?? entry).connection &&
            (entry.owner ?? entry).reservation &&
            (!(entry.owner ?? entry).authExpiresAt ||
              (entry.owner ?? entry).authExpiresAt! > this.now())
        )
        .map((entry) => (entry.owner ?? entry).connection!.verifiedPeerId)
    );
    return addresses.filter((address) => {
      const match = address.match(/\/p2p\/([^/]+)\/p2p-circuit(?:\/|$)/);
      return !match || eligible.has(match[1]);
    });
  }

  private root(entry: Entry): Entry {
    return entry.parent ?? entry;
  }
  private lanes(entry: Entry): Entry[] {
    return [...(this.root(entry).lanes?.values() ?? [entry])];
  }
  private addFamilies(root: Entry, addresses: string[]): Promise<void>[] {
    if (!root.lanes) return [];
    const setups: Promise<void>[] = [];
    for (const address of addresses) {
      const family = transportFamily(address);
      if (!family || !this.adapter.supportsAddress(address)) continue;
      const existing = root.lanes.get(family);
      if (existing) {
        if (existing.available === false) {
          existing.available = true;
          existing.retryAt = 0;
          existing.attempt = 0;
          const priorSetup = existing.setupFlight;
          this.emit(existing, {
            status: "connecting",
            reason: undefined,
            retryAt: undefined,
          });
          setups.push(
            (async () => {
              await existing.cleanupFlight;
              await priorSetup;
              if (
                existing.available !== false &&
                !existing.connection &&
                this.entries.get(root.config.key) === root
              )
                await this.setup(existing);
            })()
          );
        }
        continue;
      }
      const lane: Entry = {
        config: root.config,
        parent: root,
        family,
        state: { ...root.state, status: "connecting" },
        generation: 0,
        controller: new AbortController(),
        attempt: 0,
        retryAt: 0,
      };
      root.lanes.set(family, lane);
      setups.push(this.setup(lane));
    }
    return setups;
  }
  private async reconcileExplicitFamilies(
    root: Entry,
    addresses: string[]
  ): Promise<void> {
    const configuration = root.config;
    const currentConfiguration = () =>
      !this.stopped &&
      this.entries.get(configuration.key) === root &&
      root.config === configuration &&
      this.desired.get(configuration.key) === configuration;
    const available = new Set(
      addresses
        .filter((address) => this.adapter.supportsAddress(address))
        .map(transportFamily)
    );
    const withdrawn = this.lanes(root).filter(
      (lane) =>
        lane.family && lane.available !== false && !available.has(lane.family)
    );
    const cleanups = withdrawn.map((lane) => {
      const flight = (async () => {
        lane.available = false;
        lane.generation++;
        lane.controller.abort();
        this.clearTimers(lane, lane === root);
        const connection = lane.connection;
        const reservation = lane.reservation;
        lane.connection = undefined;
        lane.reservation = undefined;
        if (root.owner === lane) {
          root.owner = undefined;
          this.emit(root, { status: "connecting", reason: undefined });
          if (connection) {
            try {
              await this.deadline(
                DEADLINES.rendezvous,
                new AbortController().signal,
                (signal) => this.adapter.unregister(connection, signal)
              );
            } catch {
              /* local ownership cleanup continues when the lease is unavailable */
            }
          }
        }
        await reservation?.release().catch(() => undefined);
        await connection?.close().catch(() => undefined);
      })();
      lane.cleanupFlight = flight;
      void flight
        .finally(() => {
          if (lane.cleanupFlight === flight) lane.cleanupFlight = undefined;
        })
        .catch(() => undefined);
      return flight;
    });
    this.notify();
    await Promise.all(cleanups);
    if (!currentConfiguration()) return;
    await this.promote(root);
    if (!currentConfiguration()) return;
    await Promise.all(this.addFamilies(root, addresses));
    if (!currentConfiguration()) return;
    if (!available.size) {
      if (!this.lanes(root).some((lane) => lane.connection))
        this.releaseClaims(root);
      this.emit(root, { status: "retrying", reason: "no_supported_addresses" });
    }
  }
  private async provision(entry: Entry): Promise<void> {
    const root = this.root(entry);
    if (root.provisioning) await root.provisioning.catch(() => undefined);
    if (root.owner?.connection && root.owner.reservation) return;
    const generation = entry.generation;
    const connection = entry.connection;
    if (!connection) return;
    const flight = (async () => {
      const reservation = await this.deadline(
        DEADLINES.reserve,
        entry.controller.signal,
        (signal) => this.adapter.reserve(connection, signal),
        (late) => late.release().catch(() => undefined)
      );
      if (!this.current(entry, generation) || entry.connection !== connection) {
        await reservation.release().catch(() => undefined);
        return;
      }
      const selected = reservation.connection ?? connection;
      const owner = this.lanes(root).find(
        (lane) => lane.connection === selected
      );
      if (
        !owner ||
        (owner.authExpiresAt && owner.authExpiresAt <= this.now())
      ) {
        await reservation.release().catch(() => undefined);
        throw new Error("relay_reservation_owner_not_authenticated");
      }
      owner.reservation = reservation;
      root.owner = owner;
      try {
        await this.register(owner, selected);
      } catch (error) {
        if (owner !== entry) {
          this.failure(owner, error, true);
          return;
        }
        throw error;
      }
    })();
    root.provisioning = flight;
    try {
      await flight;
    } finally {
      if (root.provisioning === flight) root.provisioning = undefined;
    }
  }
  private async promote(root: Entry): Promise<void> {
    for (const lane of this.lanes(root)) {
      if (
        lane.available === false ||
        !lane.connection ||
        (lane.authExpiresAt && lane.authExpiresAt <= this.now())
      )
        continue;
      try {
        await this.provision(lane);
        if (root.owner === lane)
          this.emit(lane, { status: "ready", reason: undefined });
        return;
      } catch (error) {
        this.failure(lane, error, Boolean(lane.reservation));
      }
    }
  }
  private releaseClaims(root: Entry): void {
    for (const [peerId, owner] of this.peerClaims)
      if (owner === root) this.peerClaims.delete(peerId);
    this.retryConflicts();
  }
  private retryConflicts(): void {
    for (const entry of this.entries.values())
      if (entry.state.status === "conflict") void this.retry(entry.config.key);
  }
  private notify(states: RelayState[] = this.states()): void {
    try {
      this.adapter.onStateChange?.(states);
    } catch {
      /* An observer cannot interrupt ownership or resource cleanup. */
    }
  }
  private emit(entry: Entry, patch: Partial<RelayState>): void {
    entry.state = { ...entry.state, ...patch };
    this.notify();
  }
  private current(entry: Entry, generation: number): boolean {
    return (
      !this.stopped &&
      this.entries.get(entry.config.key) === this.root(entry) &&
      entry.generation === generation
    );
  }
  private async deadline<T>(
    ms: number,
    parent: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
    onLateSuccess?: (value: T) => Promise<void>
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    parent.addEventListener("abort", abort, { once: true });
    if (parent.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    try {
      return await Promise.race([
        operation(controller.signal).then(async (value) => {
          if (expired) await onLateSuccess?.(value);
          return value;
        }),
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(
            () => {
              expired = true;
              controller.abort();
              reject(new Error("deadline_exceeded"));
            },
            Math.max(0, ms)
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    }
  }
  private async token(entry: Entry): Promise<string | null> {
    const url = (
      entry.config as Extract<RelayConfiguration, { kind: "managed" }>
    ).discoveryUrl;
    const existing = this.tokenFlights.get(url);
    if (existing) return existing;
    const flight = this.deadline(
      DEADLINES.auth,
      entry.controller.signal,
      (signal) => this.adapter.accessToken(url, signal)
    );
    this.tokenFlights.set(url, flight);
    try {
      return await flight;
    } finally {
      if (this.tokenFlights.get(url) === flight) this.tokenFlights.delete(url);
    }
  }
  private setup(entry: Entry): Promise<void> {
    if (entry.setupFlight) return entry.setupFlight;
    const flight = this.setupSlot(() => this.attempt(entry), this.root(entry));
    entry.setupFlight = flight;
    void flight.finally(() => {
      if (entry.setupFlight === flight) entry.setupFlight = undefined;
    });
    return flight;
  }
  private clearTimers(entry: Entry, keepDiscovery = false): void {
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    if (entry.renewTimer) clearTimeout(entry.renewTimer);
    if (entry.authExpiryTimer) clearTimeout(entry.authExpiryTimer);
    if (!keepDiscovery && entry.discoveryTimer)
      clearTimeout(entry.discoveryTimer);
    entry.retryTimer = entry.renewTimer = entry.authExpiryTimer = undefined;
    if (!keepDiscovery) entry.discoveryTimer = undefined;
  }
  private async setupSlot<T>(work: () => Promise<T>, root: Entry): Promise<T> {
    while (!this.setupOwners.has(root) && this.setupActive >= 4)
      await new Promise<void>((resolve) => this.setupQueue.push(resolve));
    if (!this.setupOwners.has(root)) {
      this.setupActive++;
      this.setupOwners.set(root, 0);
    }
    this.setupOwners.set(root, this.setupOwners.get(root)! + 1);
    try {
      return await work();
    } finally {
      const users = this.setupOwners.get(root)! - 1;
      if (users) this.setupOwners.set(root, users);
      else {
        this.setupOwners.delete(root);
        this.setupActive--;
        for (const ready of this.setupQueue.splice(0)) ready();
      }
    }
  }
  private endpointIdentity(config: RelayConfiguration): string {
    return config.kind === "managed"
      ? `managed:${config.discoveryUrl}`
      : `explicit:${config.peerId}`;
  }
  private sameEndpoint(
    left: RelayConfiguration,
    right: RelayConfiguration
  ): boolean {
    return this.endpointIdentity(left) === this.endpointIdentity(right);
  }
  private detachEntry(entry: Entry, eraseCredentials: boolean): Promise<void> {
    if (this.entries.get(entry.config.key) !== entry)
      return this.cleanupByKey.get(entry.config.key) ?? Promise.resolve();
    this.entries.delete(entry.config.key);
    for (const lane of this.lanes(entry)) {
      lane.generation++;
      lane.controller.abort();
      this.clearTimers(lane);
    }
    const owner = entry.owner ?? entry;
    const connections = this.lanes(entry).map((lane) => ({
      lane,
      connection: lane.connection,
    }));
    for (const { lane } of connections) lane.connection = undefined;
    const cleanup = (async () => {
      try {
        if (
          owner.connection ||
          connections.some(
            ({ lane, connection }) => lane === owner && connection
          )
        ) {
          const connection = connections.find(
            ({ lane }) => lane === owner
          )?.connection!;
          try {
            await this.deadline(
              DEADLINES.rendezvous,
              new AbortController().signal,
              (signal) => this.adapter.unregister(connection, signal)
            );
          } catch {
            /* cleanup best effort */
          }
        }
        await Promise.all(
          connections.map(async ({ lane, connection }) => {
            await lane.cleanupFlight;
            await lane.reservation?.release().catch(() => undefined);
            await connection?.close().catch(() => undefined);
          })
        );
      } finally {
        this.releaseClaims(entry);
      }
      if (eraseCredentials && entry.config.kind === "managed")
        await this.adapter.eraseCredentials(entry.config.discoveryUrl);
    })();
    const key = entry.config.key;
    const endpoint = this.endpointIdentity(entry.config);
    this.cleanupByKey.set(key, cleanup);
    this.cleanupByEndpoint.set(endpoint, cleanup);
    this.notify();
    void cleanup
      .finally(() => {
        if (this.cleanupByKey.get(key) === cleanup)
          this.cleanupByKey.delete(key);
      })
      .catch(() => undefined);
    void cleanup
      .then(() => {
        if (this.cleanupByEndpoint.get(endpoint) === cleanup)
          this.cleanupByEndpoint.delete(endpoint);
      })
      .catch(() => undefined);
    return cleanup;
  }
  private async addAfterCleanup(config: RelayConfiguration): Promise<void> {
    const key = config.key;
    const endpoint = this.endpointIdentity(config);
    const pending = [
      this.cleanupByKey.get(key),
      this.cleanupByEndpoint.get(endpoint),
    ].filter((value): value is Promise<void> => Boolean(value));
    await Promise.all(pending);
    if (
      this.stopped ||
      this.desired.get(key) !== config ||
      this.entries.has(key)
    )
      return;
    const entry: Entry = {
      config,
      state: {
        key,
        name: config.name,
        kind: config.kind,
        status: "connecting",
      },
      generation: 0,
      controller: new AbortController(),
      attempt: 0,
      retryAt: 0,
    };
    this.entries.set(key, entry);
    this.notify();
    await this.setup(entry);
  }
  async setConfigurations(values: unknown): Promise<void> {
    const configs = normalizeRelayConfigurations(values);
    this.stopped = false;
    this.desired.clear();
    for (const config of configs) this.desired.set(config.key, config);
    const cleanups: Promise<void>[] = [];
    const transportSetups: Promise<void>[] = [];
    for (const entry of [...this.entries.values()]) {
      const next = this.desired.get(entry.config.key);
      if (!next || !this.sameEndpoint(entry.config, next)) {
        cleanups.push(this.detachEntry(entry, true));
      } else {
        for (const lane of this.lanes(entry)) {
          lane.config = next;
          lane.state.name = next.name;
        }
        this.emit(entry, { name: next.name });
        if (next.kind === "explicit")
          transportSetups.push(
            this.reconcileExplicitFamilies(entry, next.addresses)
          );
      }
    }
    const additions = configs
      .filter((config) => !this.entries.has(config.key))
      .map((config) => this.addAfterCleanup(config));
    await Promise.all([...cleanups, ...transportSetups, ...additions]);
  }
  async remove(key: string): Promise<void> {
    this.desired.delete(key);
    const entry = this.entries.get(key);
    if (entry) await this.detachEntry(entry, true);
    else await this.cleanupByKey.get(key);
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.desired.clear();
    const cleanups = [...this.entries.values()].map((entry) =>
      this.detachEntry(entry, false)
    );
    this.notify([]);
    await this.deadline(
      DEADLINES.shutdown,
      new AbortController().signal,
      async () => {
        await Promise.all([...cleanups, ...this.cleanupByKey.values()]);
      }
    );
  }
  async connectionLost(
    key: string,
    connection?: ManagedRelayConnection
  ): Promise<void> {
    const root = this.entries.get(key);
    if (!root) return;
    const entry = this.lanes(root).find(
      (lane) =>
        lane.connection && (!connection || lane.connection === connection)
    );
    if (!entry?.connection) return;
    entry.generation++;
    entry.controller.abort();
    this.clearTimers(entry, true);
    const owned = entry.connection;
    entry.connection = undefined;
    if (root.owner === entry) root.owner = undefined;
    await entry.reservation?.release().catch(() => undefined);
    entry.reservation = undefined;
    await owned.close().catch(() => undefined);
    await this.promote(root);
    if (
      !this.lanes(root).some((lane) => lane.connection) &&
      root.state.peerId &&
      this.peerClaims.get(root.state.peerId) === root
    ) {
      this.releaseClaims(root);
    }
    if (entry.state.status === "login_needed") {
      this.emit(entry, { status: "login_needed" });
      return;
    }
    this.failure(entry, new Error("connection_lost"));
  }
  async refreshSession(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry)
      await Promise.all(
        this.lanes(entry)
          .filter((lane) => this.now() >= lane.retryAt)
          .map((lane) => this.renew(lane))
      );
  }
  async requestLogin(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || entry.config.kind !== "managed") return;
    await this.adapter.interactiveLogin(entry.config.discoveryUrl);
    await Promise.all(
      this.lanes(entry).map(async (lane) => {
        lane.retryAt = 0;
        if (lane.connection) await this.renew(lane);
        else await this.retryLane(lane);
      })
    );
  }
  async manageAccount(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry?.config.kind === "managed")
      await this.adapter.openAccount(entry.config.discoveryUrl);
  }
  async retry(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry)
      await Promise.all(this.lanes(entry).map((lane) => this.retryLane(lane)));
  }
  private async retryLane(entry: Entry): Promise<void> {
    if (
      entry.available === false ||
      entry.state.status === "ready" ||
      this.now() < entry.retryAt
    )
      return;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = undefined;
    if (
      entry.state.status === "degraded" &&
      entry.connection &&
      entry.reservation
    ) {
      await this.repairRendezvous(entry);
      return;
    }
    if (entry.connection && entry.config.kind === "managed") {
      await this.renew(entry);
      return;
    }
    await this.setup(entry);
  }
  private async attempt(entry: Entry): Promise<void> {
    if (this.stopped || this.entries.get(entry.config.key) !== this.root(entry))
      return;
    const generation = ++entry.generation;
    entry.controller.abort();
    entry.controller = new AbortController();
    this.emit(entry, {
      status: "connecting",
      reason: undefined,
      retryAt: undefined,
    });
    const root = this.root(entry);
    let otherSetups: Promise<void>[] = [];
    let connection: ManagedRelayConnection | undefined;
    let authResult: RelayAuthResult | undefined;
    try {
      let peerId: string;
      let addresses: string[];
      let accessToken: string | null = null;
      if (entry.config.kind === "managed") {
        accessToken = await this.token(entry);
        if (!this.current(entry, generation)) return;
        if (!accessToken) {
          this.emit(entry, { status: "login_needed" });
          return;
        }
        let document = root.document;
        if (!document || document.validUntil <= this.now()) {
          document = await this.deadline(
            DEADLINES.discovery,
            entry.controller.signal,
            (signal) =>
              this.adapter.discover(
                (
                  entry.config as Extract<
                    RelayConfiguration,
                    { kind: "managed" }
                  >
                ).discoveryUrl,
                accessToken!,
                signal
              )
          );
          if (!this.current(entry, generation)) return;
          document = this.validateDocument(document);
          root.document = document;
          this.scheduleDiscoveryRefresh(root, document.validUntil);
        }
        peerId = document.relay.peerId;
        addresses = document.relay.addresses;
      } else {
        peerId = entry.config.peerId;
        addresses = entry.config.addresses;
      }
      const pinnedPeer = this.lanes(root).find((lane) => lane.connection)
        ?.connection?.verifiedPeerId;
      if (pinnedPeer && pinnedPeer !== peerId)
        throw new Error("relay_identity_changed");
      const owner = this.peerClaims.get(peerId);
      if (owner && owner !== root) {
        this.emit(entry, {
          status: "conflict",
          peerId,
          reason: `Peer ID already used by ${owner.config.key}`,
        });
        return;
      }
      this.peerClaims.set(peerId, root);
      if (entry !== root) root.state = { ...root.state, peerId };
      this.emit(entry, { peerId });
      addresses = addresses
        .filter(
          (address) =>
            this.adapter.supportsAddress(address) && transportFamily(address)
        )
        .sort(
          (left, right) =>
            (this.adapter.addressPriority?.(left) ?? 0) -
            (this.adapter.addressPriority?.(right) ?? 0)
        );
      if (!root.lanes && addresses.length) {
        entry.family = transportFamily(addresses[0]);
        root.lanes = new Map([[entry.family!, entry]]);
      }
      if (!entry.parent) otherSetups = this.addFamilies(root, addresses);
      connection = await this.dialAddresses(
        entry,
        addresses.filter(
          (address) => transportFamily(address) === entry.family
        ),
        peerId
      );
      if (!this.current(entry, generation)) {
        await connection.close();
        return;
      }
      if (entry.config.kind === "managed") {
        const authMs = Math.min(
          DEADLINES.auth,
          Math.max(
            0,
            (connection.initialAuthDeadlineMs ?? Infinity) - this.now()
          )
        );
        const result = await this.deadline(
          authMs,
          entry.controller.signal,
          (signal) =>
            this.adapter.authenticate(connection!, accessToken!, signal)
        );
        this.validateAuthResult(result);
        if (!this.current(entry, generation)) {
          await connection.close().catch(() => undefined);
          return;
        }
        authResult = result;
      }
      entry.connection = connection;
      if (authResult) this.scheduleRenewal(entry, authResult);
      await this.provision(entry);
      if (!this.current(entry, generation)) return;
      entry.attempt = 0;
      this.emit(entry, {
        status: "ready",
        peerId,
        reason: undefined,
        warning: undefined,
      });
    } catch (error) {
      if (connection && !entry.reservation) {
        if (entry.connection === connection) entry.connection = undefined;
        if (entry.renewTimer) clearTimeout(entry.renewTimer);
        if (entry.authExpiryTimer) clearTimeout(entry.authExpiryTimer);
        await connection.close().catch(() => undefined);
      }
      if (!this.current(entry, generation)) return;
      if (
        !this.lanes(root).some(
          (lane) => lane.connection || (lane !== entry && lane.setupFlight)
        ) &&
        entry.state.peerId &&
        this.peerClaims.get(entry.state.peerId) === root
      )
        this.peerClaims.delete(entry.state.peerId);
      this.retryConflicts();
      if (
        error instanceof Error &&
        (error.message === "all_address_dials_failed" ||
          error.message === "dial_deadline_exceeded")
      )
        root.document = undefined;
      this.failure(entry, error, Boolean(entry.reservation));
    } finally {
      await Promise.all(otherSetups);
      if (
        !entry.parent &&
        this.current(entry, generation) &&
        !this.lanes(root).some((lane) => lane.connection) &&
        root.state.peerId &&
        this.peerClaims.get(root.state.peerId) === root
      ) {
        this.releaseClaims(root);
      }
    }
  }
  private scheduleDiscoveryRefresh(entry: Entry, at: number): void {
    if (entry.discoveryTimer) clearTimeout(entry.discoveryTimer);
    entry.discoveryTimer = setTimeout(
      () => {
        void this.refreshDiscovery(entry);
      },
      Math.max(0, at - this.now())
    );
  }
  private async refreshDiscovery(entry: Entry): Promise<void> {
    if (
      entry.config.kind !== "managed" ||
      this.entries.get(entry.config.key) !== entry ||
      this.stopped
    )
      return;
    const generation = entry.generation;
    try {
      const token = await this.token(entry);
      if (!this.current(entry, generation)) return;
      if (!token) {
        this.emit(entry, {
          status: "login_needed",
          reason: "invalid_credentials",
        });
        return;
      }
      let document = await this.deadline(
        DEADLINES.discovery,
        entry.controller.signal,
        (signal) =>
          this.adapter.discover(
            (entry.config as Extract<RelayConfiguration, { kind: "managed" }>)
              .discoveryUrl,
            token,
            signal
          )
      );
      if (!this.current(entry, generation)) return;
      document = this.validateDocument(document);
      entry.document = document;
      this.scheduleDiscoveryRefresh(entry, document.validUntil);
      const livePeer = this.lanes(entry).find((lane) => lane.connection)
        ?.connection?.verifiedPeerId;
      if (livePeer && livePeer !== document.relay.peerId)
        this.emit(entry, {
          warning:
            "Relay identity changed; current session remains active until reconnect",
        });
      else await Promise.all(this.addFamilies(entry, document.relay.addresses));
    } catch (error) {
      if (!this.current(entry, generation)) return;
      const code = error instanceof Error ? error.message : "discovery_failed";
      this.emit(entry, { warning: `Discovery refresh failed: ${code}` });
      this.scheduleDiscoveryRefresh(entry, this.now() + 5_000);
    }
  }
  private validateDocument(document: DiscoveryDocument): DiscoveryDocument {
    const now = this.now();
    if (
      !document ||
      document.version !== 1 ||
      !document.relay ||
      typeof document.relay.peerId !== "string" ||
      !document.relay.peerId ||
      !Array.isArray(document.relay.addresses) ||
      document.relay.addresses.length === 0 ||
      !Number.isFinite(document.validUntil) ||
      document.validUntil <= now ||
      document.validUntil >
        now + DISCOVERY_MAX_LIFETIME_MS + DISCOVERY_CLOCK_TOLERANCE_MS
    )
      throw new Error("invalid_discovery");
    for (const address of document.relay.addresses) {
      if (
        typeof address !== "string" ||
        !isCompleteRelayAddress(address, document.relay.peerId)
      )
        throw new Error("invalid_discovery_address");
      try {
        multiaddr(address);
      } catch {
        throw new Error("invalid_discovery_address");
      }
    }
    return {
      ...document,
      validUntil: Math.min(
        document.validUntil,
        now + DISCOVERY_MAX_LIFETIME_MS
      ),
    };
  }
  private async dialSlot(
    entry: Entry,
    address: string,
    signal: AbortSignal
  ): Promise<ManagedRelayConnection> {
    const root = this.root(entry);
    const slots = (root.dials ??= { active: 0, queue: [] });
    const queued = slots.active >= 2;
    if (queued)
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const index = slots.queue.indexOf(ready);
          if (index >= 0) slots.queue.splice(index, 1);
          reject(new Error("dial_aborted"));
        };
        slots.queue.push(ready);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    if (!queued) slots.active++;
    try {
      signal.throwIfAborted();
      return await this.adapter.dial(address, signal);
    } finally {
      const next = slots.queue.shift();
      if (next) next();
      else slots.active--;
    }
  }
  private async dialAddresses(
    entry: Entry,
    addresses: string[],
    expectedPeerId: string
  ): Promise<ManagedRelayConnection> {
    if (addresses.length === 0) throw new Error("no_supported_addresses");
    const controller = new AbortController();
    const abort = () => controller.abort();
    entry.controller.signal.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let staggerTimer: ReturnType<typeof setTimeout> | undefined;
    let next = 0;
    let active = 0;
    let settled = false;
    return new Promise<ManagedRelayConnection>((resolve, reject) => {
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        controller.abort();
        if (staggerTimer) clearTimeout(staggerTimer);
        reject(error);
      };
      timer = setTimeout(
        () => fail(new Error("dial_deadline_exceeded")),
        DEADLINES.dial
      );
      const launch = (secondReady = false) => {
        while (!settled && active < 2 && next < addresses.length) {
          if (active === 1 && !secondReady) {
            if (!staggerTimer)
              staggerTimer = setTimeout(() => {
                staggerTimer = undefined;
                launch(true);
              }, 100);
            return;
          }
          secondReady = false;
          const address = addresses[next++];
          active++;
          void this.dialSlot(entry, address, controller.signal)
            .then(
              async (connection) => {
                active--;
                if (
                  settled ||
                  controller.signal.aborted ||
                  !this.entries.has(entry.config.key)
                ) {
                  await connection.close().catch(() => undefined);
                  return;
                }
                if (connection.verifiedPeerId !== expectedPeerId) {
                  await connection.close().catch(() => undefined);
                  launch();
                  return;
                }
                settled = true;
                if (timer) clearTimeout(timer);
                if (staggerTimer) clearTimeout(staggerTimer);
                controller.abort();
                resolve(connection);
              },
              () => {
                active--;
                launch();
              }
            )
            .finally(() => {
              if (!settled && active === 0 && next >= addresses.length)
                fail(new Error("all_address_dials_failed"));
            });
        }
      };
      launch();
    }).finally(() => {
      if (timer) clearTimeout(timer);
      if (staggerTimer) clearTimeout(staggerTimer);
      entry.controller.signal.removeEventListener("abort", abort);
    });
  }
  private async compensateLateRegistration(
    entry: Entry,
    connection: ManagedRelayConnection,
    generation: number
  ): Promise<void> {
    if (this.current(entry, generation) && entry.connection === connection) {
      if (entry.state.status === "degraded") {
        if (entry.retryTimer) clearTimeout(entry.retryTimer);
        entry.retryTimer = undefined;
        entry.attempt = 0;
        this.emit(entry, {
          status: "ready",
          reason: undefined,
          retryAt: undefined,
        });
      }
      return;
    }
    try {
      await this.deadline(
        DEADLINES.rendezvous,
        new AbortController().signal,
        (signal) => this.adapter.unregister(connection, signal)
      );
    } catch {
      /* remote lease also expires when the owned connection closes */
    }
  }
  private async register(
    entry: Entry,
    connection: ManagedRelayConnection
  ): Promise<void> {
    const generation = entry.generation;
    await this.deadline(
      DEADLINES.rendezvous,
      entry.controller.signal,
      async (signal) => {
        const record = await this.adapter.signedPeerRecord();
        try {
          await this.adapter.register(connection, record, 2, signal);
        } catch (error) {
          if (
            !(error instanceof RelayOperationError) ||
            error.code !== "unsupported_protocol"
          )
            throw error;
          await this.adapter.register(connection, record, 1, signal);
        }
      },
      () => this.compensateLateRegistration(entry, connection, generation)
    );
    if (!this.current(entry, generation) || entry.connection !== connection) {
      await this.compensateLateRegistration(entry, connection, generation);
    }
  }
  private async repairRendezvous(entry: Entry): Promise<void> {
    const connection = entry.connection;
    const generation = entry.generation;
    if (!connection) return;
    try {
      await this.register(entry, connection);
      if (!this.current(entry, generation) || entry.connection !== connection)
        return;
      this.emit(entry, { status: "ready", reason: undefined });
      entry.attempt = 0;
    } catch (error) {
      if (!this.current(entry, generation) || entry.connection !== connection)
        return;
      this.failure(entry, error, true);
    }
  }
  private validateAuthResult(result: RelayAuthResult): void {
    if (
      !result ||
      !Number.isFinite(result.sessionExpiresAt) ||
      result.sessionExpiresAt <= this.now() ||
      result.sessionExpiresAt > this.now() + 900_000 ||
      !Number.isFinite(result.renewAfterMillis) ||
      result.renewAfterMillis <= 0 ||
      result.renewAfterMillis > 900_000
    )
      throw new Error("invalid_auth_result");
  }
  private scheduleRenewal(entry: Entry, result: RelayAuthResult): void {
    entry.authExpiresAt = result.sessionExpiresAt;
    if (entry.renewTimer) clearTimeout(entry.renewTimer);
    if (entry.authExpiryTimer) clearTimeout(entry.authExpiryTimer);
    const connection = entry.connection;
    entry.authExpiryTimer = setTimeout(
      () => {
        if (connection) void this.connectionLost(entry.config.key, connection);
      },
      Math.max(0, result.sessionExpiresAt - this.now())
    );
    const delay = Math.max(
      0,
      Math.min(result.renewAfterMillis, result.sessionExpiresAt - this.now())
    );
    entry.renewTimer = setTimeout(() => {
      void this.renew(entry);
    }, delay);
  }
  private async renew(entry: Entry): Promise<void> {
    if (entry.renewFlight) return entry.renewFlight;
    const connection = entry.connection;
    const generation = entry.generation;
    if (!connection || entry.config.kind !== "managed") return;
    const flight = (async () => {
      try {
        const token = await this.token(entry);
        if (!this.current(entry, generation) || entry.connection !== connection)
          return;
        if (!token) {
          this.emit(entry, { status: "login_needed" });
          return;
        }
        const result = await this.deadline(
          DEADLINES.auth,
          entry.controller.signal,
          (signal) => this.adapter.authenticate(connection, token, signal)
        );
        if (!this.current(entry, generation) || entry.connection !== connection)
          return;
        this.validateAuthResult(result);
        this.scheduleRenewal(entry, result);
        entry.attempt = 0;
        this.emit(entry, {
          status: "ready",
          warning: undefined,
          reason: undefined,
          retryAt: undefined,
        });
      } catch (error) {
        if (!this.current(entry, generation) || entry.connection !== connection)
          return;
        this.renewalFailure(entry, error);
      }
    })();
    entry.renewFlight = flight;
    try {
      await flight;
    } finally {
      entry.renewFlight = undefined;
    }
  }
  private renewalFailure(entry: Entry, error: unknown): void {
    const code =
      error instanceof RelayOperationError
        ? error.code
        : error instanceof Error
          ? error.message
          : "unknown_error";
    if (code === "invalid_credentials" || code === "authentication_failed") {
      this.emit(entry, {
        status: "login_needed",
        reason: code,
        warning: "Existing session remains valid until expiry",
      });
      return;
    }
    const refusal =
      code === "quota_exhausted" || code === "session_limit_exceeded";
    const backoff = refusal
      ? 300_000 * (0.8 + this.random() * 0.4)
      : RETRY[Math.min(entry.attempt++, RETRY.length - 1)] *
        (0.5 + this.random() * 0.5);
    const hint =
      error instanceof RelayOperationError ? (error.retryAfterMillis ?? 0) : 0;
    const delay = Math.max(backoff, hint);
    entry.retryAt = this.now() + delay;
    this.emit(entry, {
      status: refusal ? "refused" : "ready",
      reason: refusal ? code : undefined,
      warning: refusal
        ? undefined
        : "Renewal failed; retrying while the current session remains valid",
      retryAt: entry.retryAt,
    });
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = setTimeout(() => {
      void this.renew(entry);
    }, delay);
  }
  private failure(entry: Entry, error: unknown, rendezvousOnly = false): void {
    const code =
      error instanceof RelayOperationError
        ? error.code
        : error instanceof Error
          ? error.message
          : "unknown_error";
    if (code === "invalid_credentials" || code === "authentication_failed") {
      this.emit(entry, { status: "login_needed", reason: code });
      return;
    }
    const refusal =
      code === "quota_exhausted" || code === "session_limit_exceeded";
    const backoff = refusal
      ? 300_000 * (0.8 + this.random() * 0.4)
      : RETRY[Math.min(entry.attempt++, RETRY.length - 1)] *
        (0.5 + this.random() * 0.5);
    const hint =
      error instanceof RelayOperationError ? (error.retryAfterMillis ?? 0) : 0;
    const delay = Math.max(backoff, hint);
    entry.retryAt = this.now() + delay;
    this.emit(entry, {
      status:
        rendezvousOnly && entry.connection
          ? "degraded"
          : refusal
            ? "refused"
            : "retrying",
      reason: code,
      retryAt: entry.retryAt,
    });
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = setTimeout(() => {
      void this.retryLane(entry);
    }, delay);
  }
}

/** New-model settings only. The adapter never reads legacy relayAddresses here. */
export type ManagedRelayConfigurationStore = {
  readNewModel(): Promise<unknown | null>;
  writeNewModel(configurations: RelayConfiguration[]): Promise<void>;
};

export async function loadManagedRelayConfigurations(
  store: ManagedRelayConfigurationStore
): Promise<RelayConfiguration[]> {
  const values = await store.readNewModel();
  return values == null ? [] : normalizeRelayConfigurations(values);
}

export async function saveManagedRelayConfigurations(
  store: ManagedRelayConfigurationStore,
  values: unknown
): Promise<RelayConfiguration[]> {
  const normalized = normalizeRelayConfigurations(values);
  await store.writeNewModel(normalized);
  return normalized;
}
