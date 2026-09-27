import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import type { AndroidRelaySecretBridge } from "./managedRelayAuth";

type NativeManagedRelayPlugin = {
  readCredential(options: {
    discoveryUrl: string;
  }): Promise<{ credential: string | null }>;
  writeCredential(options: {
    discoveryUrl: string;
    credential: string;
  }): Promise<void>;
  eraseCredential(options: { discoveryUrl: string }): Promise<void>;
  openBrowser(options: { url: string }): Promise<void>;
  postToken(options: {
    discoveryUrl: string;
    form: string;
  }): Promise<{ status: number; body: string }>;
  getDiscovery(options: {
    discoveryUrl: string;
    accessToken: string;
  }): Promise<{ status: number; body: string }>;
  addListener(
    event: "oauthCallback",
    listener: (event: { url: string }) => void
  ): Promise<PluginListenerHandle>;
};

const native = registerPlugin<NativeManagedRelayPlugin>("ManagedRelay");

function requireAndroid(): void {
  if (Capacitor.getPlatform() !== "android")
    throw new Error("native_relay_credentials_unavailable");
}

export function createAndroidRelaySecretBridge(): AndroidRelaySecretBridge & {
  onCallback(handler: (url: string) => void): Promise<() => void>;
  getDiscovery(
    discoveryUrl: string,
    accessToken: string
  ): Promise<{ status: number; body: string }>;
} {
  return {
    async readCredential(discoveryUrl) {
      requireAndroid();
      return (await native.readCredential({ discoveryUrl })).credential;
    },
    async writeCredential(discoveryUrl, credential) {
      requireAndroid();
      await native.writeCredential({ discoveryUrl, credential });
    },
    async eraseCredential(discoveryUrl) {
      requireAndroid();
      await native.eraseCredential({ discoveryUrl });
    },
    async openBrowser(url) {
      requireAndroid();
      await native.openBrowser({ url });
    },
    async postToken(discoveryUrl, form) {
      requireAndroid();
      return native.postToken({ discoveryUrl, form });
    },
    async getDiscovery(discoveryUrl, accessToken) {
      requireAndroid();
      return native.getDiscovery({ discoveryUrl, accessToken });
    },
    async onCallback(handler) {
      requireAndroid();
      const handle = await native.addListener("oauthCallback", ({ url }) =>
        handler(url)
      );
      return () => void handle.remove();
    },
  };
}
