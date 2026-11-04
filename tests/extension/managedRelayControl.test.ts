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
  it("accepts initialization only for its transport owner generation", () => {
    const message = {
      target: "offscreen",
      action: "init",
      relays: [],
      managedConfigurations: [],
      runtimeGeneration: "worker-session:0",
      transportOwner: "transport:1",
    };

    expect(
      parseManagedRelayControlMessage(
        message,
        "worker-session:0",
        "transport:1"
      )
    ).toEqual({ action: "init", configurations: [] });
    expect(
      parseManagedRelayControlMessage(
        message,
        "worker-session:0",
        "transport:2"
      )
    ).toBeNull();
  });

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

it.each([
  [
    {
      target: "offscreen",
      action: "init",
      relays: [],
      managedConfigurations: [],
    },
    { action: "init", configurations: [] },
  ],
  [
    { target: "offscreen", action: "setManagedRelays", configurations: [] },
    { action: "setManagedRelays", configurations: [] },
  ],
  [
    { target: "offscreen", action: "retryManagedRelay", key: "saved" },
    { action: "retryManagedRelay", key: "saved" },
  ],
])(
  "validates the current runtime envelope around strict managed control %j",
  (payload, control) => {
    const message = { ...payload, runtimeGeneration: "worker-session:0" };
    expect(
      parseManagedRelayControlMessage(message, "worker-session:0")
    ).toEqual(control);
    expect(
      parseManagedRelayControlMessage(message, "retired-session:0")
    ).toBeNull();
    expect(
      parseManagedRelayControlMessage(
        { ...message, accessToken: "unexpected" },
        "worker-session:0"
      )
    ).toBeNull();
    expect(parseManagedRelayControlMessage(message)).toBeNull();
  }
);
