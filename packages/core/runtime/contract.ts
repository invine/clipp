import type { MessagingTransport } from "../messaging/transport";

export type RuntimePlatform = "electron" | "android" | "chrome-extension";

export type RuntimeCapabilities = {
  platform: RuntimePlatform;
  clipboardCapture: "polling" | "explicit-input";
  relayConfiguration: "editable" | "fixed";
  pinPersistence: "durable" | "session";
  notificationApi: "electron" | "capacitor" | "chrome";
  postRotationClipboardCapture: "baseline-current" | "deferred";
  liveClipboardApplicationRecovery: "none" | "one-resume-retry";
};

export interface RuntimeIdentityStorage<Identity> {
  load(): Promise<Identity | undefined>;
  save(identity: Identity): Promise<void>;
  clear(): Promise<void>;
}

export type RuntimeTransaction<State, Result> = {
  state: State;
  result: Result;
};

export interface RuntimeApplicationState<State> {
  read(): Promise<State>;
  transact<Result>(
    update: (state: State) => RuntimeTransaction<State, Result> | Promise<RuntimeTransaction<State, Result>>
  ): Promise<Result>;
}

export interface RuntimeClipboardAccess {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export type RuntimeNotification = {
  id: string;
  title: string;
  body: string;
};

export interface RuntimeNotifications {
  show(notification: RuntimeNotification): Promise<void>;
  dismiss(id: string): Promise<void>;
  onSelect(handler: (id: string) => void | Promise<void>): () => void;
}

export interface RuntimeLifecycle {
  onShutdown(handler: () => void | Promise<void>): () => void;
  openApprovalView(): void | Promise<void>;
}

export interface RuntimeClock {
  now(): number;
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RuntimePublicState<State> {
  read(): Promise<State>;
  publish(state: State): void | Promise<void>;
}

export type RuntimeRelayPorts = {
  readAddresses(): Promise<string[]>;
  updateAddresses?(addresses: string[]): Promise<string[]>;
};

export type RuntimeRelayAccess =
  | {
      mode: "fixed";
      readAddresses(): Promise<string[]>;
    }
  | {
      mode: "editable";
      readAddresses(): Promise<string[]>;
      updateAddresses(addresses: string[]): Promise<string[]>;
    };

export type RuntimeAdapter<Identity, ApplicationState, PublicState> = {
  capabilities: RuntimeCapabilities;
  identity: RuntimeIdentityStorage<Identity>;
  state: RuntimeApplicationState<ApplicationState>;
  clipboard: RuntimeClipboardAccess;
  notifications: RuntimeNotifications;
  lifecycle: RuntimeLifecycle;
  network: MessagingTransport;
  clock: RuntimeClock;
  publicState: RuntimePublicState<PublicState>;
  relays: RuntimeRelayAccess;
};

export type RuntimeContext<Identity, ApplicationState, PublicState> =
  RuntimeAdapter<Identity, ApplicationState, PublicState> & {
    publishState(): Promise<PublicState>;
  };
