jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (address: string) => ({ toString: () => address }) }),
  { virtual: true }
);

import {
  AndroidManagedRelayAuth,
  ANDROID_RELAY_REDIRECT,
} from "../../apps/android/src/managedRelayAuth";
import { performRelayAction } from "../../packages/core/network/relayActions";
import { createUiSession } from "../../packages/ui/src/uiSession";

const endpoint = "https://relay.example/v1/relay";

function bridge() {
  const saved = new Map<string, string>();
  return {
    saved,
    readCredential: jest.fn(async (url: string) => saved.get(url) ?? null),
    writeCredential: jest.fn(async (url: string, value: string) => {
      saved.set(url, value);
    }),
    eraseCredential: jest.fn(async (url: string) => {
      saved.delete(url);
    }),
    openBrowser: jest.fn(async (_url: string) => undefined),
  };
}

function tokens(access = "access-new", refresh = "refresh-new") {
  return new Response(
    JSON.stringify({
      access_token: access,
      token_type: "Bearer",
      expires_in: 900,
      refresh_token: refresh,
    }),
    { status: 200 }
  );
}

describe("Android managed relay authorization", () => {
  it("settles denial through the owning action when the WebView reports an opaque callback path", async () => {
    const native = bridge();
    const fetcher = jest.fn(async (_input: RequestInfo | URL) => tokens());
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const session = createUiSession();
    const action = session.relayAction("relay", () =>
      performRelayAction(
        "authenticated",
        () => auth.login(endpoint),
        async () => {}
      )
    );
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const platformUrl = globalThis.URL;
    const state = new platformUrl(
      native.openBrowser.mock.calls[0][0]
    ).searchParams.get("state")!;
    const callback = `${ANDROID_RELAY_REDIRECT}?error=access_denied&state=${state}`;
    // Controlled platform replay of c813's actual WebView fields for these
    // unchanged URI bytes: host="", pathname="//oauth/callback".
    class RecordedWebViewUrl extends platformUrl {
      get host() {
        return this.protocol === "clipp-relay:" ? "" : super.host;
      }
      get pathname() {
        return this.protocol === "clipp-relay:"
          ? `//${super.host}${super.pathname}`
          : super.pathname;
      }
    }
    globalThis.URL = RecordedWebViewUrl;
    try {
      expect(session.getSnapshot().relayActions.relay.pending).toBe(true);
      expect(await auth.acceptCallback(callback)).toBe(true);
      await action;
      expect(session.getSnapshot().relayActions.relay).toEqual({
        pending: false,
        result: { status: "rejected", error: "authorization_denied" },
      });
      expect(await auth.acceptCallback(callback)).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
      expect(native.writeCredential).not.toHaveBeenCalled();
    } finally {
      globalThis.URL = platformUrl;
      await auth.erase(endpoint);
      await action;
    }
  });

  it("rejects wrong state, redirect, duplicate and late callbacks without exchanging a code", async () => {
    const native = bridge();
    const fetcher = jest.fn(async (_input: RequestInfo | URL) => tokens());
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const login = auth.login(endpoint);
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const url = new URL(native.openBrowser.mock.calls[0][0]);
    const state = url.searchParams.get("state")!;
    expect(url.searchParams.get("redirect_uri")).toBe(ANDROID_RELAY_REDIRECT);
    await expect(
      auth.acceptCallback(`${ANDROID_RELAY_REDIRECT}?code=abc&state=wrong`)
    ).resolves.toBe(false);
    await expect(
      auth.acceptCallback(
        `clipp-relay://wrong/callback?code=abc&state=${state}`
      )
    ).resolves.toBe(false);
    await expect(
      auth.acceptCallback(
        `${ANDROID_RELAY_REDIRECT}?code=abc&code=def&state=${state}`
      )
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await auth.acceptCallback(
        `${ANDROID_RELAY_REDIRECT}?code=abc&state=${state}`
      )
    ).toBe(true);
    await login;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await auth.acceptCallback(
        `${ANDROID_RELAY_REDIRECT}?code=abc&state=${state}`
      )
    ).toBe(false);
  });

  it("rejects noncanonical redirects and malformed callback queries without consuming the pending login", async () => {
    const native = bridge();
    const fetcher = jest.fn(async (_input: RequestInfo | URL) => tokens());
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const login = auth.login(endpoint);
    const outcome = login.catch((error: Error) => error.message);
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const state = new URL(native.openBrowser.mock.calls[0][0]).searchParams.get(
      "state"
    )!;
    const query = `?error=access_denied&state=${state}`;
    const invalid = [
      `clipp-relay://else/callback${query}`,
      `clipp-relay://oauth/other${query}`,
      `clipp-relay://user@oauth/callback${query}`,
      `clipp-relay://oauth:123/callback${query}`,
      `clipp-relay://oauth/callback/extra${query}`,
      `clipp-relay://oauth/other/../callback${query}`,
      `clipp-relay-acceptance://oauth/callback${query}`,
      `CLIPP-RELAY://oauth/callback${query}`,
      ` ${ANDROID_RELAY_REDIRECT}${query}`,
      `clipp-relay://oa\tuth/callback${query}`,
      `${ANDROID_RELAY_REDIRECT}${query}\n`,
      `${ANDROID_RELAY_REDIRECT}${query}#`,
      `${ANDROID_RELAY_REDIRECT}${query}#fragment`,
      `${ANDROID_RELAY_REDIRECT}?error=access_denied`,
      `${ANDROID_RELAY_REDIRECT}?error=access_denied&state=wrong`,
      `${ANDROID_RELAY_REDIRECT}${query}&state=${state}`,
      `${ANDROID_RELAY_REDIRECT}${query}&%73tate=${state}`,
      `${ANDROID_RELAY_REDIRECT}${query}&error=access_denied`,
      `${ANDROID_RELAY_REDIRECT}${query}&code=abc`,
      `${ANDROID_RELAY_REDIRECT}?code=abc&code=def&state=${state}`,
      `${ANDROID_RELAY_REDIRECT}?code=&state=${state}`,
      `${ANDROID_RELAY_REDIRECT}?error=&state=${state}`,
      `${ANDROID_RELAY_REDIRECT}${query}&extra=1`,
    ];
    try {
      for (const callback of invalid)
        expect(await auth.acceptCallback(callback)).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
      expect(native.writeCredential).not.toHaveBeenCalled();
      expect(
        await auth.acceptCallback(`${ANDROID_RELAY_REDIRECT}${query}`)
      ).toBe(true);
      expect(await outcome).toBe("authorization_denied");
    } finally {
      await auth.erase(endpoint);
      await outcome;
    }
  });

  it("uses endpoint-scoped refresh and erases the old credential before rotation", async () => {
    const native = bridge();
    native.saved.set(endpoint, "refresh-old");
    const fetcher = jest.fn(async (_input: RequestInfo | URL) => tokens());
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const [a, b] = await Promise.all([
      auth.accessToken(endpoint, new AbortController().signal),
      auth.accessToken(endpoint, new AbortController().signal),
    ]);
    expect([a, b]).toEqual(["access-new", "access-new"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(native.eraseCredential).toHaveBeenCalledWith(endpoint);
    expect(native.saved.get(endpoint)).toBe("refresh-new");
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://relay.example/oauth/token"
    );
  });

  it("keeps an explicit login when an older refresh response arrives later", async () => {
    const native = bridge();
    native.saved.set(endpoint, "refresh-old");
    let finishRefresh!: (response: Response) => void;
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const grant = new URLSearchParams(String(init?.body)).get("grant_type");
        if (grant === "refresh_token")
          return new Promise<Response>((resolve) => {
            finishRefresh = resolve;
          });
        return tokens("login-access", "login-refresh");
      }
    );
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const refreshing = auth.accessToken(endpoint, new AbortController().signal);
    while (!finishRefresh)
      await new Promise((resolve) => setTimeout(resolve, 0));

    const login = auth.login(endpoint);
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const state = new URL(native.openBrowser.mock.calls[0][0]).searchParams.get(
      "state"
    )!;
    expect(
      await auth.acceptCallback(
        `${ANDROID_RELAY_REDIRECT}?code=fresh&state=${state}`
      )
    ).toBe(true);
    await login;
    expect(native.saved.get(endpoint)).toBe("login-refresh");

    finishRefresh(tokens("stale-access", "stale-refresh"));
    await refreshing;
    expect(native.saved.get(endpoint)).toBe("login-refresh");
    expect(await auth.accessToken(endpoint, new AbortController().signal)).toBe(
      "login-access"
    );
  });

  it("does not let an older encrypted save finish after the new login save", async () => {
    const native = bridge();
    native.saved.set(endpoint, "refresh-old");
    let finishOldSave!: () => void;
    native.writeCredential.mockImplementation(async (url, value) => {
      if (value === "stale-refresh")
        await new Promise<void>((resolve) => {
          finishOldSave = resolve;
        });
      native.saved.set(url, value);
    });
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new URLSearchParams(String(init?.body)).get("grant_type") ===
        "refresh_token"
          ? tokens("stale-access", "stale-refresh")
          : tokens("login-access", "login-refresh")
    );
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const refreshing = auth.accessToken(endpoint, new AbortController().signal);
    while (!finishOldSave)
      await new Promise((resolve) => setTimeout(resolve, 0));

    const login = auth.login(endpoint);
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const state = new URL(native.openBrowser.mock.calls[0][0]).searchParams.get(
      "state"
    )!;
    const callback = auth.acceptCallback(
      `${ANDROID_RELAY_REDIRECT}?code=fresh&state=${state}`
    );
    const loginFinishedBeforeOldSave = await Promise.race([
      login.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10)),
    ]);
    finishOldSave();
    expect(loginFinishedBeforeOldSave).toBe(false);
    expect(await callback).toBe(true);
    await login;
    await refreshing;
    expect(native.saved.get(endpoint)).toBe("login-refresh");
    expect(await auth.accessToken(endpoint, new AbortController().signal)).toBe(
      "login-access"
    );
  });

  it("keeps a rotated credential in RAM with warning when encrypted save fails", async () => {
    const native = bridge();
    native.saved.set(endpoint, "refresh-old");
    native.writeCredential.mockRejectedValueOnce(new Error("disk"));
    const auth = new AndroidManagedRelayAuth(
      native,
      jest.fn(async () => tokens())
    );
    expect(await auth.accessToken(endpoint, new AbortController().signal)).toBe(
      "access-new"
    );
    expect(native.saved.has(endpoint)).toBe(false);
    expect(auth.warning(endpoint)).toMatch(/restart/i);
    expect(await auth.accessToken(endpoint, new AbortController().signal)).toBe(
      "access-new"
    );
  });

  it("reopens with only the renewable credential and gets a fresh access token", async () => {
    const native = bridge();
    native.saved.set(endpoint, "refresh-in-keystore");
    const fetcher = jest.fn(async (_input: RequestInfo | URL) =>
      tokens("new-access", "rotated-refresh")
    );
    const reopened = new AndroidManagedRelayAuth(native, fetcher);
    expect(
      await reopened.accessToken(endpoint, new AbortController().signal)
    ).toBe("new-access");
    expect(native.saved.get(endpoint)).toBe("rotated-refresh");
    expect([...native.saved.values()]).not.toContain("new-access");
  });

  it("expires a pending callback without exchanging or following a different relay", async () => {
    const native = bridge();
    const fetcher = jest.fn(async (_input: RequestInfo | URL) => tokens());
    let now = 100;
    const auth = new AndroidManagedRelayAuth(native, fetcher, () => now);
    const login = auth.login(endpoint);
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const state = new URL(native.openBrowser.mock.calls[0][0]).searchParams.get(
      "state"
    )!;
    now += 10 * 60_000;
    expect(
      await auth.acceptCallback(
        `${ANDROID_RELAY_REDIRECT}?code=abc&state=${state}`
      )
    ).toBe(false);
    await expect(login).rejects.toThrow("login_expired");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels pending browser login when its relay is removed", async () => {
    const native = bridge();
    const fetcher = jest.fn(async (_input: RequestInfo | URL) => tokens());
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const login = auth.login(endpoint);
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const state = new URL(native.openBrowser.mock.calls[0][0]).searchParams.get(
      "state"
    )!;
    await auth.erase(endpoint);
    await expect(login).rejects.toThrow("login_cancelled");
    expect(
      await auth.acceptCallback(
        `${ANDROID_RELAY_REDIRECT}?code=abc&state=${state}`
      )
    ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(native.saved.size).toBe(0);
  });

  it("allows only one browser login preparation at a time", async () => {
    const native = bridge();
    const auth = new AndroidManagedRelayAuth(
      native,
      jest.fn(async (_input: RequestInfo | URL) => tokens())
    );
    const first = auth.login(endpoint);
    await expect(auth.login("https://other.example/v1/relay")).rejects.toThrow(
      "login_already_pending"
    );
    await auth.erase(endpoint);
    await expect(first).rejects.toThrow("login_cancelled");
    expect(native.openBrowser).not.toHaveBeenCalled();
  });

  it("does not persist a late exchange response after removal", async () => {
    const native = bridge();
    let finish!: (response: Response) => void;
    const fetcher = jest.fn(
      (_input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const auth = new AndroidManagedRelayAuth(native, fetcher);
    const login = auth.login(endpoint);
    while (native.openBrowser.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const state = new URL(native.openBrowser.mock.calls[0][0]).searchParams.get(
      "state"
    )!;
    const callback = auth.acceptCallback(
      `${ANDROID_RELAY_REDIRECT}?code=abc&state=${state}`
    );
    while (fetcher.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const erase = auth.erase(endpoint);
    finish(tokens());
    expect(await callback).toBe(true);
    await erase;
    await expect(login).rejects.toThrow("login_cancelled");
    expect(native.saved.size).toBe(0);
  });
});
