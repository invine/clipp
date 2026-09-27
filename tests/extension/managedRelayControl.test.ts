jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

import {
  authorizedBackgroundControl,
  parseManagedRelayControlMessage,
} from "../../apps/extension/src/managedRelayControl";

const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const workerUrl = `chrome-extension://${id}/service-worker-loader.js`;

describe("offscreen managed relay control", () => {
  it("accepts only this extension's background service worker", () => {
    expect(
      authorizedBackgroundControl({ id, url: workerUrl }, id, workerUrl)
    ).toBe(true);
    expect(
      authorizedBackgroundControl(
        { id, url: `chrome-extension://${id}/src/options.html` },
        id,
        workerUrl
      )
    ).toBe(false);
    expect(
      authorizedBackgroundControl(
        { id: "other", url: workerUrl },
        id,
        workerUrl
      )
    ).toBe(false);
  });

  it("validates the complete managed init and mutation payloads", () => {
    expect(
      parseManagedRelayControlMessage({
        target: "offscreen",
        action: "init",
        relays: [],
        managedConfigurations: [],
      })
    ).toEqual({ action: "init", configurations: [] });
    expect(
      parseManagedRelayControlMessage({
        target: "offscreen",
        action: "init",
        relays: ["/ip4/127.0.0.1/tcp/1"],
        managedConfigurations: [],
      })
    ).toBeNull();
    expect(
      parseManagedRelayControlMessage({
        target: "offscreen",
        action: "setManagedRelays",
        configurations: [
          {
            key: "x",
            name: "x",
            kind: "managed",
            discoveryUrl: "http://bad/v1/relay",
          },
        ],
      })
    ).toBeNull();
    expect(
      parseManagedRelayControlMessage({
        target: "offscreen",
        action: "retryManagedRelay",
        key: "x",
        accessToken: "secret",
      })
    ).toBeNull();
    expect(
      parseManagedRelayControlMessage({
        target: "offscreen",
        action: "shutdown",
      })
    ).toEqual({ action: "shutdown" });
  });
});
