jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

import {
  isConfiguredManagedEndpoint,
  replaceManagedRelayConfigurations,
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
    const next = await replaceManagedRelayConfigurations(
      [old, current],
      [current],
      {
        erase: async (url) => {
          events.push(`erase:${url}`);
        },
        write: async () => {
          events.push("write");
        },
      }
    );
    expect(next).toEqual([current]);
    expect(events).toEqual([`erase:${old.discoveryUrl}`, "write"]);
    expect(isConfiguredManagedEndpoint(next, old.discoveryUrl)).toBe(false);
    expect(isConfiguredManagedEndpoint(next, current.discoveryUrl)).toBe(true);
  });

  it("leaves configuration active for a retry if credential erase fails", async () => {
    const write = jest.fn();
    await expect(
      replaceManagedRelayConfigurations([old], [], {
        erase: async () => {
          throw new Error("erase_failed");
        },
        write,
      })
    ).rejects.toThrow("erase_failed");
    expect(write).not.toHaveBeenCalled();
  });
});
