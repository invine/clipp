import { ChromeStorageBackend } from "./chromeStorage";
import { createExtensionManagedRelayCredentials } from "./managedRelayCredentials";

export function createChromeManagedRelayCredentials(
  registeredExtensionId: string
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
    identity,
    registeredExtensionId,
    async fetchToken(url, form) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(
          response.status === 400 || response.status === 401
            ? "relay_login_needed"
            : "relay_token_unavailable"
        );
      return await response.json();
    },
  });
}
