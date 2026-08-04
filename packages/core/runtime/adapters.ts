import type { ClipboardService, GetSenderIdFn } from "../clipboard/service";
import { createManualClipboardService, createPollingClipboardService } from "../clipboard/service";
import type { MessagingTransport } from "../messaging/transport";
import type { KVStorageBackend } from "../trust";
import type {
  RuntimeAdapter,
  RuntimeApplicationState,
  RuntimeCapabilities,
  RuntimeClock,
  RuntimeIdentityStorage,
  RuntimeRelayAccess,
  RuntimeRelayPorts,
  RuntimeTransaction,
} from "./contract";
import { RUNTIME_CAPABILITIES } from "./capabilities";

export const systemRuntimeClock: RuntimeClock = {
  now: () => Date.now(),
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createRuntimeNotificationSelection() {
  const handlers = new Set<(id: string) => void | Promise<void>>();
  return {
    onSelect(handler: (id: string) => void | Promise<void>) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(id: string) {
      handlers.forEach((handler) => void handler(id));
    },
  };
}

export type RuntimeAdapterPorts<Identity, ApplicationState, PublicState> = Omit<
  RuntimeAdapter<Identity, ApplicationState, PublicState>,
  "capabilities" | "relays"
> & { relays: RuntimeRelayPorts };

export type RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState> = Omit<
  RuntimeAdapterPorts<Identity, ApplicationState, PublicState>,
  "identity" | "state"
> & {
  storage: KVStorageBackend;
  identityKey: string;
  applicationStateKey: string;
  initialApplicationState(): ApplicationState;
};

function createRuntimeRelayAccess(
  capabilities: RuntimeCapabilities,
  ports: RuntimeRelayPorts
): RuntimeRelayAccess {
  if (capabilities.relayConfiguration === "fixed") {
    return { mode: "fixed", readAddresses: ports.readAddresses };
  }
  if (!ports.updateAddresses) throw new Error("editable_relays_require_update_access");
  return {
    mode: "editable",
    readAddresses: ports.readAddresses,
    updateAddresses: ports.updateAddresses,
  };
}

function createPlatformRuntimeAdapter<Identity, ApplicationState, PublicState>(
  capabilities: RuntimeCapabilities,
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  const {
    storage,
    identityKey,
    applicationStateKey,
    initialApplicationState,
    relays,
    ...adapterPorts
  } = dependencies;
  return {
    ...adapterPorts,
    capabilities,
    identity: createKVRuntimeIdentityStorage<Identity>({ storage, key: identityKey }),
    state: createKVRuntimeApplicationState<ApplicationState>({
      storage,
      key: applicationStateKey,
      initialState: initialApplicationState,
    }),
    relays: createRuntimeRelayAccess(capabilities, relays),
  };
}

export function createElectronRuntimeAdapter<Identity, ApplicationState, PublicState>(
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  return createPlatformRuntimeAdapter(RUNTIME_CAPABILITIES.electron, dependencies);
}

export function createAndroidRuntimeAdapter<Identity, ApplicationState, PublicState>(
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  return createPlatformRuntimeAdapter(RUNTIME_CAPABILITIES.android, dependencies);
}

export function createChromeExtensionRuntimeAdapter<Identity, ApplicationState, PublicState>(
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  return createPlatformRuntimeAdapter(RUNTIME_CAPABILITIES.chromeExtension, dependencies);
}

export function createKVRuntimeIdentityStorage<Identity>(options: {
  storage: KVStorageBackend;
  key: string;
}): RuntimeIdentityStorage<Identity> {
  return {
    load: () => options.storage.get<Identity>(options.key),
    save: (identity) => options.storage.set(options.key, identity),
    clear: () => options.storage.remove(options.key),
  };
}

export function createKVRuntimeApplicationState<State>(options: {
  storage: KVStorageBackend;
  key: string;
  initialState: () => State;
}): RuntimeApplicationState<State> {
  return createSerializedRuntimeApplicationState({
    read: async () => {
      const stored = await options.storage.get<State>(options.key);
      return stored ?? options.initialState();
    },
    write: (state) => options.storage.set(options.key, state),
  });
}

export function createSerializedRuntimeApplicationState<State>(options: {
  read(): Promise<State>;
  write(state: State): Promise<void>;
}): RuntimeApplicationState<State> {
  let queue: Promise<void> = Promise.resolve();

  return {
    async read() {
      await queue;
      return clone(await options.read());
    },
    async transact<Result>(
      update: (state: State) => RuntimeTransaction<State, Result> | Promise<RuntimeTransaction<State, Result>>
    ) {
      let result!: Result;
      const operation = queue.then(async () => {
        const transaction = await update(clone(await options.read()));
        await options.write(clone(transaction.state));
        result = transaction.result;
      });
      queue = operation.then(
        () => undefined,
        () => undefined
      );
      await operation;
      return result;
    },
  };
}

export function createRuntimeClipboardService(options: {
  capabilities: RuntimeCapabilities;
  getSenderId: GetSenderIdFn;
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
  pollIntervalMs?: number;
  now?: () => number;
  makeId?: () => string;
}): ClipboardService {
  const common = {
    getSenderId: options.getSenderId,
    writeText: options.writeText,
    now: options.now,
    makeId: options.makeId,
  };
  if (options.capabilities.clipboardCapture === "explicit-input") {
    return createManualClipboardService(common);
  }
  if (!options.readText) throw new Error("polling_clipboard_requires_read_access");
  return createPollingClipboardService({
    ...common,
    readText: options.readText,
    pollIntervalMs: options.pollIntervalMs,
  });
}

export function createRuntimeNetworkProxy(
  current: () => MessagingTransport | null | undefined
): MessagingTransport {
  const requireNetwork = (): MessagingTransport => {
    const network = current();
    if (!network) throw new Error("runtime_network_unavailable");
    return network;
  };
  return {
    start: () => requireNetwork().start(),
    stop: async () => current()?.stop(),
    send: (protocol, target, data) => requireNetwork().send(protocol, target, data),
    connect: (target) => requireNetwork().connect(target),
    onMessage: (protocol, handler) => requireNetwork().onMessage(protocol, handler),
    onPeerConnected: (handler) => requireNetwork().onPeerConnected(handler),
    onPeerDisconnected: (handler) => requireNetwork().onPeerDisconnected(handler),
    onRelayConnectionChanged: (handler) => requireNetwork().onRelayConnectionChanged?.(handler),
    onSelfPeerUpdate: (handler) => requireNetwork().onSelfPeerUpdate(handler),
    getConnectedPeers: () => current()?.getConnectedPeers() ?? [],
    getSelfMultiaddrs: () => current()?.getSelfMultiaddrs?.() ?? [],
    getPeerConnectionInfo: () => current()?.getPeerConnectionInfo?.() ?? [],
    getRelayConnectionInfo: () => current()?.getRelayConnectionInfo?.() ?? [],
  };
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
