jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

import {
  authorizedManagedRelayPort,
  MANAGED_RELAY_PORT,
  parseAccessReply,
  parseAccessRequest,
} from "../../apps/extension/src/managedRelayBridge";

describe("managed relay offscreen port", () => {
  it("accepts only the extension offscreen document and one canonical token action", () => {
    const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const url = `chrome-extension://${id}/offscreen.html`;
    expect(
      authorizedManagedRelayPort({ id, url }, id, url, MANAGED_RELAY_PORT)
    ).toBe(true);
    expect(
      authorizedManagedRelayPort(
        { id, url: `chrome-extension://${id}/src/popup.html` },
        id,
        url,
        MANAGED_RELAY_PORT
      )
    ).toBe(false);
    expect(
      parseAccessRequest({
        action: "accessToken",
        discoveryUrl: "https://relay.example/v1/relay",
      })
    ).toEqual({
      action: "accessToken",
      discoveryUrl: "https://relay.example/v1/relay",
    });
    expect(
      parseAccessRequest({
        action: "accessToken",
        discoveryUrl: "https://relay.example/v1/relay",
        refreshToken: "secret",
      })
    ).toBeNull();
    expect(
      parseAccessRequest({
        action: "accessToken",
        discoveryUrl: "http://relay.example/v1/relay",
      })
    ).toBeNull();
  });

  it("rejects renewable credentials in a reply", () => {
    expect(parseAccessReply({ accessToken: "short" })).toEqual({
      accessToken: "short",
      warning: undefined,
    });
    expect(
      parseAccessReply({ accessToken: "short", refreshToken: "secret" })
    ).toBeNull();
  });
});
