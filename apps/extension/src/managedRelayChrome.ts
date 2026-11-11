import { logRelayAccess } from "../../../packages/core/network/managedRelayDiagnostics";
import type { IdentityBoundWorkFence } from "../../../packages/core/runtime/identityInitialization";
import { ChromeStorageBackend } from "./chromeStorage";
import { createExtensionManagedRelayCredentials } from "./managedRelayCredentials";
import { postManagedRelayToken } from "./managedRelayTokenHttp";

export function createChromeManagedRelayCredentials(
  registeredExtensionId: string,
  workFence?: IdentityBoundWorkFence
) {
  const area = chrome.storage.local;
  const backend = new ChromeStorageBackend();
  const storage = {
    async restrict(): Promise<void> {
      await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    },
    read: (key: string) => backend.get(key),
    write: (key: string, value: unknown) => backend.set(key, value),
    remove: (key: string) => backend.remove(key),
  };
  const identity = {
    extensionId: chrome.runtime.id,
    redirectUrl: chrome.identity.getRedirectURL("clipp-relay"),
    launch: (url: string) =>
      chrome.identity.launchWebAuthFlow({ url, interactive: true }),
    async open(url: string) {
      await chrome.tabs.create({ url });
    },
  };
  return createExtensionManagedRelayCredentials({
    storage,
    workFence,
    identity,
    registeredExtensionId,
    fetchToken: postManagedRelayToken,
    onAccessDiagnostic: logRelayAccess,
  });
}
