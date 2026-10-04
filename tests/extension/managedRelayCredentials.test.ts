jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);

import { createExtensionManagedRelayCredentials } from "../../apps/extension/src/managedRelayCredentials";

const endpoint = "https://relay.example/v1/relay";
const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function harness() {
  const events: string[] = [];
  const records = new Map<string, unknown>();
  const storage = {
    async restrict() {
      events.push("restrict");
    },
    async read(key: string) {
      events.push("read");
      return records.get(key);
    },
    async write(key: string, value: unknown) {
      events.push("write");
      records.set(key, value);
    },
    async remove(key: string) {
      events.push("remove");
      records.delete(key);
    },
  };
  const identity = {
    extensionId,
    redirectUrl: `https://${extensionId}.chromiumapp.org/clipp-relay`,
    async launch(url: string) {
      const state = new URL(url).searchParams.get("state");
      return `${this.redirectUrl}?code=authorization-code&state=${state}`;
    },
    async open(_url: string) {},
  };
  const fetchToken = jest.fn(async (_url: string, form: URLSearchParams) => {
    events.push(form.get("grant_type")!);
    return {
      access_token: "access-1",
      refresh_token: "refresh-1",
      token_type: "Bearer",
      expires_in: 900,
    };
  });
  const service = createExtensionManagedRelayCredentials({
    storage,
    identity,
    fetchToken,
    registeredExtensionId: extensionId,
    now: () => 1000,
  });
  return { service, events, records, identity, fetchToken, storage };
}

describe("Chrome managed relay credentials", () => {
  it("restricts local storage before credential reads and keeps first adoption empty", async () => {
    const { service, events } = harness();
    expect(await service.accessToken(endpoint)).toBeNull();
    expect(events).toEqual(["restrict", "read"]);
  });

  it("uses exact Chrome callback and fresh PKCE on explicit login", async () => {
    const { service, records, fetchToken } = harness();
    await service.interactiveLogin(endpoint);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    const [url, form] = fetchToken.mock.calls[0];
    expect(url).toBe("https://relay.example/oauth/token");
    expect(form.get("redirect_uri")).toBe(
      `https://${extensionId}.chromiumapp.org/clipp-relay`
    );
    expect(form.get("client_id")).toBe("extension");
    expect(form.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify([...records.values()])).toContain("refresh-1");
    expect(JSON.stringify([...records.values()])).not.toContain("access-1");
  });

  it("rejects callback state mismatch and unregistered IDs before token exchange", async () => {
    const { service, identity, fetchToken } = harness();
    identity.launch = async () => `${identity.redirectUrl}?code=x&state=wrong`;
    await expect(service.interactiveLogin(endpoint)).rejects.toThrow(/state/);
    expect(fetchToken).not.toHaveBeenCalled();
    const bad = createExtensionManagedRelayCredentials({
      storage: {
        restrict: async () => {},
        read: async () => undefined,
        write: async () => {},
        remove: async () => {},
      },
      identity,
      fetchToken,
      registeredExtensionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    await expect(bad.interactiveLogin(endpoint)).rejects.toThrow(/registered/);
  });

  it("rejects a callback delivered to a different extension origin", async () => {
    const { service, identity, fetchToken } = harness();
    identity.launch = async (url) =>
      `https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/clipp-relay?code=x&state=${new URL(url).searchParams.get("state")}`;
    await expect(service.interactiveLogin(endpoint)).rejects.toThrow(
      /callback/
    );
    expect(fetchToken).not.toHaveBeenCalled();
  });

  it("gives pending-account guidance only for access_denied", async () => {
    const { service, identity, fetchToken } = harness();
    identity.launch = async (url) =>
      `${identity.redirectUrl}?error=access_denied&state=${new URL(url).searchParams.get("state")}`;
    await expect(service.interactiveLogin(endpoint)).rejects.toThrow(
      /pending.*approval/i
    );
    identity.launch = async (url) =>
      `${identity.redirectUrl}?error=server_error&state=${new URL(url).searchParams.get("state")}`;
    await expect(service.interactiveLogin(endpoint)).rejects.toThrow(
      /authorization failed/i
    );
    expect(fetchToken).not.toHaveBeenCalled();
  });

  it("single-flights refresh and marks the old credential unusable before the request", async () => {
    const { service, records, events, fetchToken } = harness();
    await service.interactiveLogin(endpoint);
    let release!: () => void;
    fetchToken.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "Bearer",
        expires_in: 900,
      };
    });
    const first = service.accessToken(endpoint, { forceRefresh: true });
    const second = service.accessToken(endpoint, { forceRefresh: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.stringify([...records.values()])).toContain("refreshing");
    release();
    expect(await Promise.all([first, second])).toEqual([
      "access-2",
      "access-2",
    ]);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(fetchToken.mock.calls[1][1].get("grant_type")).toBe("refresh_token");
    expect(JSON.stringify([...records.values()])).not.toContain("refresh-1");
  });

  it("does not replay a consumed refresh credential after worker restart", async () => {
    const { service, records, identity, storage, fetchToken } = harness();
    await service.interactiveLogin(endpoint);
    fetchToken.mockImplementationOnce(async () => {
      throw new Error("response_lost");
    });
    expect(
      await service.accessToken(endpoint, { forceRefresh: true })
    ).toBeNull();
    expect(JSON.stringify([...records.values()])).toContain("refreshing");
    const restarted = createExtensionManagedRelayCredentials({
      storage,
      identity,
      fetchToken,
      registeredExtensionId: extensionId,
    });
    expect(await restarted.accessToken(endpoint)).toBeNull();
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it("keeps a rotated credential only in RAM and warns when persistence fails", async () => {
    const { service, storage, records, fetchToken } = harness();
    await service.interactiveLogin(endpoint);
    storage.write = async (_key, value) => {
      if ((value as { status: string }).status === "ready")
        throw new Error("disk_full");
      records.set(_key, value);
    };
    fetchToken.mockImplementationOnce(async () => ({
      access_token: "access-2",
      refresh_token: "refresh-2",
      token_type: "Bearer",
      expires_in: 900,
    }));
    expect(await service.accessToken(endpoint, { forceRefresh: true })).toBe(
      "access-2"
    );
    expect(service.warning(endpoint)).toMatch(/restart/);
    expect(JSON.stringify([...records.values()])).toContain("refreshing");
    expect(JSON.stringify([...records.values()])).not.toContain("refresh-1");
  });

  it("serializes refresh, replacement login and removal for one endpoint", async () => {
    const { service, fetchToken, records } = harness();
    await service.interactiveLogin(endpoint);
    let release!: () => void;
    fetchToken.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        access_token: "old-access",
        refresh_token: "old-rotation",
        token_type: "Bearer",
        expires_in: 900,
      };
    });
    fetchToken.mockImplementationOnce(async () => ({
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "Bearer",
      expires_in: 900,
    }));
    const refresh = service.accessToken(endpoint, { forceRefresh: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const login = service.interactiveLogin(endpoint);
    release();
    await refresh;
    await login;
    expect(await service.accessToken(endpoint)).toBe("new-access");
    expect(JSON.stringify([...records.values()])).toContain("new-refresh");
    await service.eraseCredentials(endpoint);
    expect(await service.accessToken(endpoint)).toBeNull();
    expect(records.size).toBe(0);
  });

  it("does not save a login that completes after its configuration was removed", async () => {
    const { service, identity, records, fetchToken } = harness();
    let complete!: (callback: string) => void;
    let browserStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      browserStarted = resolve;
    });
    identity.launch = (url) =>
      new Promise<string>((resolve) => {
        complete = (callback) =>
          resolve(
            `${callback}?code=x&state=${new URL(url).searchParams.get("state")}`
          );
        browserStarted();
      });
    const login = service.interactiveLogin(endpoint);
    await started;
    await service.eraseCredentials(endpoint);
    complete(identity.redirectUrl);
    await expect(login).rejects.toThrow(/superseded/);
    expect(records.size).toBe(0);
    expect(fetchToken).not.toHaveBeenCalled();
  });

  it("withholds an in-flight refresh response once credential cleanup begins", async () => {
    const { service, fetchToken, records } = harness();
    await service.interactiveLogin(endpoint);
    let release!: () => void;
    fetchToken.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        access_token: "stale-access",
        refresh_token: "stale-refresh",
        token_type: "Bearer",
        expires_in: 900,
      };
    });
    const refresh = service.accessToken(endpoint, { forceRefresh: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const removal = service.eraseCredentials(endpoint);
    release();
    await expect(refresh).resolves.toBeNull();
    await removal;
    expect(records.size).toBe(0);
  });

  it("opens one browser flow for concurrent explicit login requests", async () => {
    const { service, identity, fetchToken } = harness();
    let complete!: (callback: string) => void;
    const launch = jest.fn(
      (url: string) =>
        new Promise<string>((resolve) => {
          complete = () =>
            resolve(
              `${identity.redirectUrl}?code=x&state=${new URL(url).searchParams.get("state")}`
            );
        })
    );
    identity.launch = launch;
    const first = service.interactiveLogin(endpoint);
    const second = service.interactiveLogin(endpoint);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(launch).toHaveBeenCalledTimes(1);
    complete(identity.redirectUrl);
    await Promise.all([first, second]);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });
});
