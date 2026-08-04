import type { MessageHandler, MessagingTransport } from "../messaging/transport";
import {
  createRuntimeNotificationSelection,
  createSerializedRuntimeApplicationState,
} from "./adapters";
import type {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeContext,
  RuntimeNotification,
} from "./contract";

type DurableState<Identity, ApplicationState> = {
  identity: Identity | undefined;
  applicationState: ApplicationState;
};

export type RuntimeObservations<PublicState> = {
  clipboardReads: number;
  clipboardWrites: string[];
  notifications: RuntimeNotification[];
  dismissedNotifications: string[];
  protocolTraffic: Array<{ protocol: string; target: string; data: Uint8Array }>;
  publicStates: PublicState[];
  approvalViewsOpened: number;
};

export type RuntimeHarnessOptions<Identity, ApplicationState, PublicState> = {
  capabilities: RuntimeCapabilities;
  initialIdentity?: Identity;
  initialApplicationState: ApplicationState;
  initialClipboardText?: string;
  now?: number;
  getPublicState(
    context: Pick<RuntimeContext<Identity, ApplicationState, PublicState>, "identity" | "state" | "capabilities">
  ): PublicState | Promise<PublicState>;
};

export function createRuntimeConformanceHarness<Identity, ApplicationState, PublicState>(
  options: RuntimeHarnessOptions<Identity, ApplicationState, PublicState>,
  durable: DurableState<Identity, ApplicationState> = {
    identity: options.initialIdentity,
    applicationState: structuredClone(options.initialApplicationState),
  }
) {
  const observed: RuntimeObservations<PublicState> = {
    clipboardReads: 0,
    clipboardWrites: [],
    notifications: [],
    dismissedNotifications: [],
    protocolTraffic: [],
    publicStates: [],
    approvalViewsOpened: 0,
  };
  const shutdownHandlers = new Set<() => void | Promise<void>>();
  const notificationSelection = createRuntimeNotificationSelection();
  const messageHandlers = new Map<string, MessageHandler[]>();
  let clipboardText = options.initialClipboardText ?? "";
  let clockNow = options.now ?? 0;
  let nextTimerId = 1;
  const timers = new Map<number, { at: number; handler: () => void }>();
  let relayAddresses: string[] = [];

  const network: MessagingTransport = {
    async start() {},
    async stop() {},
    async send(protocol, target, data) {
      observed.protocolTraffic.push({ protocol, target, data: Uint8Array.from(data) });
    },
    async connect() {},
    onMessage(protocol, handler) {
      messageHandlers.set(protocol, [...(messageHandlers.get(protocol) ?? []), handler]);
    },
    onPeerConnected() {},
    onPeerDisconnected() {},
    onSelfPeerUpdate() {},
    getConnectedPeers: () => [],
  };

  const adapter: RuntimeAdapter<Identity, ApplicationState, PublicState> = {
    capabilities: options.capabilities,
    identity: {
      async load() {
        return durable.identity;
      },
      async save(identity) {
        durable.identity = structuredClone(identity);
      },
      async clear() {
        durable.identity = undefined;
      },
    },
    state: createSerializedRuntimeApplicationState({
      read: async () => durable.applicationState,
      write: async (state) => {
        durable.applicationState = structuredClone(state);
      },
    }),
    clipboard: {
      async readText() {
        observed.clipboardReads += 1;
        return clipboardText;
      },
      async writeText(text) {
        clipboardText = text;
        observed.clipboardWrites.push(text);
      },
    },
    notifications: {
      async show(notification) {
        observed.notifications.push(structuredClone(notification));
      },
      async dismiss(id) {
        observed.dismissedNotifications.push(id);
      },
      onSelect: notificationSelection.onSelect,
    },
    lifecycle: {
      onShutdown(handler) {
        shutdownHandlers.add(handler);
        return () => shutdownHandlers.delete(handler);
      },
      openApprovalView() {
        observed.approvalViewsOpened += 1;
      },
    },
    network,
    clock: {
      now: () => clockNow,
      setTimeout(handler, delayMs) {
        const id = nextTimerId++;
        timers.set(id, { at: clockNow + Math.max(0, delayMs), handler });
        return id;
      },
      clearTimeout(handle) {
        if (typeof handle === "number") timers.delete(handle);
      },
    },
    publicState: {
      read: async () => options.getPublicState(adapter),
      async publish(state) {
        observed.publicStates.push(structuredClone(state));
      },
    },
    relays:
      options.capabilities.relayConfiguration === "editable"
        ? {
            mode: "editable",
            async readAddresses() {
              return [...relayAddresses];
            },
            async updateAddresses(addresses) {
              relayAddresses = [...addresses];
              return [...relayAddresses];
            },
          }
        : {
            mode: "fixed",
            async readAddresses() {
              return [...relayAddresses];
            },
          },
  };

  return {
    adapter,
    observed,
    async shutdown() {
      for (const handler of [...shutdownHandlers]) await handler();
    },
    async selectNotification(id: string) {
      notificationSelection.emit(id);
      await Promise.resolve();
    },
    receiveProtocol(protocol: string, from: string, data: Uint8Array) {
      messageHandlers.get(protocol)?.forEach((handler) => handler(from, Uint8Array.from(data)));
    },
    advanceTimeBy(milliseconds: number) {
      const target = clockNow + milliseconds;
      let next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      while (next) {
        timers.delete(next[0]);
        clockNow = next[1].at;
        next[1].handler();
        next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      }
      clockNow = target;
    },
    restart: () => createRuntimeConformanceHarness(options, durable),
  };
}
