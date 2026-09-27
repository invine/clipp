import { request } from "node:http";
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (address: string) => ({ toString: () => address }) }),
  { virtual: true }
);
import { createElectronManagedRelayAuth } from "../../apps/electron/src/managedRelayAuth";

const endpoint = "https://relay.example/v1/relay";

function fixture(secure = true) {
  const data = new Map<string, string>();
  const opened: string[] = [];
  const posts: URLSearchParams[] = [];
  let clock = 1_000_000;
  let failSave = false;
  let failRead = false;
  let saveGate: Promise<void> | null = null;
  let releaseSave: (() => void) | null = null;
  let tokenGate: Promise<void> | null = null;
  let releaseToken: (() => void) | null = null;
  const auth = createElectronManagedRelayAuth({
    storage: {
      get: async (key) => {
        if (failRead) {
          failRead = false;
          throw new Error("read_failed");
        }
        return data.get(key) ?? null;
      },
      set: async (key, value) => {
        if (saveGate) await saveGate;
        if (failSave) throw new Error("storage_failed");
        data.set(key, value);
      },
      delete: async (key) => {
        data.delete(key);
      },
    },
    protection: {
      isEncryptionAvailable: () => secure,
      getSelectedStorageBackend: () => (secure ? "unknown" : "basic_text"),
      encryptString: (value) => Buffer.from(`encrypted:${value}`),
      decryptString: (value) => {
        const text = value.toString();
        if (!text.startsWith("encrypted:")) throw new Error("unreadable");
        return text.slice("encrypted:".length);
      },
    },
    openExternal: async (url) => {
      opened.push(url);
    },
    postToken: async (_url, params) => {
      if (tokenGate && params.get("grant_type") === "refresh_token")
        await tokenGate;
      posts.push(params);
      return {
        access_token: `access-${posts.length}`,
        refresh_token: `refresh-${posts.length}`,
        token_type: "Bearer",
        expires_in: 900,
      };
    },
    now: () => clock,
  });
  return {
    auth,
    data,
    opened,
    posts,
    advance: (ms: number) => {
      clock += ms;
    },
    failNextSave: () => {
      failSave = true;
    },
    failNextRead: () => {
      failRead = true;
    },
    holdSave: () => {
      saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      return () => {
        releaseSave?.();
        saveGate = null;
      };
    },
    holdToken: () => {
      tokenGate = new Promise<void>((resolve) => {
        releaseToken = resolve;
      });
      return () => {
        releaseToken?.();
        tokenGate = null;
      };
    },
  };
}

async function callback(url: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("Electron managed relay authorization", () => {
  it("accepts only the initiating loopback callback and exchanges a fresh S256 code", async () => {
    const { auth, opened, posts, data } = fixture();
    const login = auth.interactiveLogin(endpoint);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const authorize = new URL(opened[0]);
    const redirect = new URL(authorize.searchParams.get("redirect_uri")!);
    expect(redirect.hostname).toBe("127.0.0.1");
    expect(redirect.pathname).toBe("/oauth/callback");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    const wrong = new URL(redirect);
    wrong.searchParams.set("state", "wrong");
    wrong.searchParams.set("code", "test-code");
    expect(await callback(wrong)).toBe(400);
    const valid = new URL(redirect);
    valid.searchParams.set("state", authorize.searchParams.get("state")!);
    valid.searchParams.set("code", "test-code");
    expect(await callback(valid)).toBe(200);
    await login;
    expect(posts[0].get("code")).toBe("test-code");
    expect(posts[0].get("redirect_uri")).toBe(redirect.href);
    expect(posts[0].get("code_verifier")).toHaveLength(43);
    expect(data.size).toBe(1);
    expect([...data.values()][0]).not.toContain("refresh-1");
    await expect(callback(valid)).rejects.toThrow();
  });

  it("does not let an older refresh overwrite a newer interactive login", async () => {
    const { auth, opened, data, posts, advance, holdToken } = fixture();
    await auth.acceptTokens(endpoint, {
      access_token: "old-access",
      refresh_token: "old-refresh",
      token_type: "Bearer",
      expires_in: 1,
    });
    advance(1_100);
    const releaseRefresh = holdToken();
    const refresh = auth.accessToken(endpoint);
    await Promise.resolve();
    const login = auth.interactiveLogin(endpoint);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const authorize = new URL(opened[0]);
    const redirect = new URL(authorize.searchParams.get("redirect_uri")!);
    redirect.searchParams.set("state", authorize.searchParams.get("state")!);
    redirect.searchParams.set("code", "new-account");
    expect(await callback(redirect)).toBe(200);
    await login;
    releaseRefresh();
    await refresh;
    expect(await auth.accessToken(endpoint)).toBe("access-1");
    expect(Buffer.from([...data.values()][0], "base64").toString()).toBe(
      "encrypted:refresh-1"
    );
    expect(posts.map((params) => params.get("grant_type"))).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
  });

  it("keeps credentials in memory when OS protection is unavailable", async () => {
    const { auth, data } = fixture(false);
    await auth.acceptTokens(endpoint, {
      access_token: "access",
      refresh_token: "refresh",
      token_type: "Bearer",
      expires_in: 900,
    });
    expect(data.size).toBe(0);
    expect(auth.warning(endpoint)).toMatch(/restart/i);
    expect(await auth.accessToken(endpoint)).toBe("access");
  });

  it("uses only the new refresh credential after a successful rotation whose save fails", async () => {
    const { auth, data, posts, advance, failNextSave } = fixture();
    await auth.acceptTokens(endpoint, {
      access_token: "access",
      refresh_token: "old-refresh",
      token_type: "Bearer",
      expires_in: 1,
    });
    const stored = [...data.values()][0];
    failNextSave();
    advance(1_100);
    expect(await auth.accessToken(endpoint)).toBe("access-1");
    expect(posts[0].get("refresh_token")).toBe("old-refresh");
    expect(auth.warning(endpoint)).toMatch(/restart/i);
    expect([...data.values()][0]).not.toBe(stored);
    expect(data.size).toBe(0);
  });

  it("erases unreadable saved credentials and requires login", async () => {
    const { auth, data } = fixture();
    data.set(
      `managedRelayRefresh:${encodeURIComponent(endpoint)}`,
      "not-a-valid-ciphertext"
    );
    expect(await auth.accessToken(endpoint)).toBeNull();
    expect(data.size).toBe(0);
    expect(auth.warning(endpoint)).toMatch(/sign in again/i);
  });

  it("cancels an unfinished browser authorization and closes its listener", async () => {
    const { auth, opened } = fixture();
    const login = auth.interactiveLogin(endpoint);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const redirect = new URL(
      new URL(opened[0]).searchParams.get("redirect_uri")!
    );
    auth.cancelAll();
    await expect(login).rejects.toThrow(/cancelled/i);
    await expect(callback(redirect)).rejects.toThrow();
  });

  it("erasure wins against a credential save already in progress", async () => {
    const { auth, data, holdSave } = fixture();
    const release = holdSave();
    const saving = auth.acceptTokens(endpoint, {
      access_token: "access",
      refresh_token: "refresh",
      token_type: "Bearer",
      expires_in: 900,
    });
    await Promise.resolve();
    const erasing = auth.erase(endpoint);
    release();
    await Promise.all([saving, erasing]);
    expect(data.size).toBe(0);
    expect(await auth.accessToken(endpoint)).toBeNull();
  });

  it("erasure wins against a refresh response already in flight", async () => {
    const { auth, data, advance, holdToken } = fixture();
    await auth.acceptTokens(endpoint, {
      access_token: "access",
      refresh_token: "old-refresh",
      token_type: "Bearer",
      expires_in: 1,
    });
    advance(1_100);
    const release = holdToken();
    const refreshing = auth.accessToken(endpoint);
    await Promise.resolve();
    const erasing = auth.erase(endpoint);
    release();
    await erasing;
    expect(await refreshing).toBeNull();
    expect(data.size).toBe(0);
  });

  it("retries a transient credential read failure instead of treating it as no credential", async () => {
    const { auth, data, failNextRead } = fixture();
    data.set(
      `managedRelayRefresh:${encodeURIComponent(endpoint)}`,
      Buffer.from("encrypted:stored-refresh").toString("base64")
    );
    failNextRead();
    await expect(auth.accessToken(endpoint)).rejects.toThrow("read_failed");
    expect(await auth.accessToken(endpoint)).toBe("access-1");
  });

  it("settles a denied callback immediately without exchanging a code", async () => {
    const { auth, opened, posts } = fixture();
    const login = auth.interactiveLogin(endpoint);
    const deniedLogin = expect(login).rejects.toThrow(/access_denied/);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const authorize = new URL(opened[0]);
    const denied = new URL(authorize.searchParams.get("redirect_uri")!);
    denied.searchParams.set("state", authorize.searchParams.get("state")!);
    denied.searchParams.set("error", "access_denied");
    expect(await callback(denied)).toBe(200);
    await deniedLogin;
    expect(posts).toHaveLength(0);
    expect(auth.warning(endpoint)).toMatch(/account/i);
    await expect(callback(denied)).rejects.toThrow();
  });
});
