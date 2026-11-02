jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

import {
  isConfiguredManagedEndpoint,
  createChromeRelayMutationOwner,
} from "../../apps/extension/src/managedRelayConfiguration";

const old = {
  key: "a",
  name: "A",
  kind: "managed" as const,
  discoveryUrl: "https://old.example/v1/relay",
};
const current = {
  key: "b",
  name: "B",
  kind: "managed" as const,
  discoveryUrl: "https://current.example/v1/relay",
};

describe("background managed relay configuration", () => {
  it("erases removed credentials before persisting, while retaining unrelated routes", async () => {
    const events: string[] = [];
    let configurations: import("../../packages/core/network/managedRelays").RelayConfiguration[] =
      [old, current];
    const owner = createChromeRelayMutationOwner({
      read: () => configurations,
      erase: async (url) => {
        events.push(`erase:${url}`);
      },
      write: async () => {
        events.push("write");
      },
      accept: (next) => {
        configurations = next;
      },
      apply: async () => {},
      reconcile: async () => {},
    });
    const result = await owner.mutate({ type: "remove", key: "a" });
    const next = result.configurations;
    expect(next).toEqual([current]);
    expect(events).toEqual([`erase:${old.discoveryUrl}`, "write"]);
    expect(isConfiguredManagedEndpoint(next, old.discoveryUrl)).toBe(false);
    expect(isConfiguredManagedEndpoint(next, current.discoveryUrl)).toBe(true);
  });

  it("leaves configuration active for a retry if credential erase fails", async () => {
    const write = jest.fn();
    const owner = createChromeRelayMutationOwner({
      read: () => [old],
      erase: async () => {
        throw new Error("erase_failed");
      },
      write,
      accept: () => {},
      apply: async () => {},
      reconcile: async () => {},
    });
    expect(await owner.mutate({ type: "remove", key: "a" })).toMatchObject({
      status: "rejected",
      configurations: [old],
      error: "erase_failed",
    });
    expect(write).not.toHaveBeenCalled();
  });
});

it("actual Chrome owner reconciles erased credentials after a later failed persistence", async () => {
  let configurations: import("../../packages/core/network/managedRelays").RelayConfiguration[] =
    [old, current];
  const credentialStore = new Set([old.discoveryUrl, current.discoveryUrl]);
  let published: unknown;
  const owner = createChromeRelayMutationOwner({
    read: () => configurations,
    erase: async (url) => {
      credentialStore.delete(url);
    },
    write: async () => {
      throw new Error("quota_exceeded");
    },
    accept: (next) => {
      configurations = next;
    },
    apply: async () => {},
    reconcile: async () => {
      published = { configurations, credentials: [...credentialStore] };
    },
  });
  expect(await owner.mutate({ type: "remove", key: "a" })).toMatchObject({
    status: "partial",
    credentialsRemoved: [old.discoveryUrl],
    configurationApplied: false,
  });
  expect(published).toEqual({
    configurations: [old, current],
    credentials: [current.discoveryUrl],
  });
});
