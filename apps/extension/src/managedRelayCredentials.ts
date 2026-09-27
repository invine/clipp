import { canonicalDiscoveryUrl } from "../../../packages/core/network/managedRelays";
import { MANAGED_RELAY_CREDENTIAL_PREFIX } from "./managedRelayConstants";

export { MANAGED_RELAY_CREDENTIAL_PREFIX } from "./managedRelayConstants";

type StoredCredential =
  { status: "ready"; refreshToken: string } | { status: "refreshing" };

export type CredentialStorage = {
  restrict(): Promise<void>;
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
};

export type BrowserIdentity = {
  extensionId: string;
  redirectUrl: string;
  launch(url: string): Promise<string | undefined>;
  open(url: string): Promise<void>;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

type CredentialOptions = {
  storage: CredentialStorage;
  identity: BrowserIdentity;
  fetchToken(url: string, form: URLSearchParams): Promise<TokenResponse>;
  registeredExtensionId: string;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  digest?: (bytes: Uint8Array) => Promise<Uint8Array>;
};

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function tokenEndpoint(discoveryUrl: string): string {
  return new URL("/oauth/token", discoveryUrl).href;
}

function authorizeEndpoint(discoveryUrl: string): string {
  return new URL("/oauth/authorize", discoveryUrl).href;
}

function requireToken(value: TokenResponse): TokenResponse {
  if (
    !value ||
    typeof value.access_token !== "string" ||
    !value.access_token ||
    typeof value.refresh_token !== "string" ||
    !value.refresh_token ||
    value.token_type !== "Bearer" ||
    !Number.isInteger(value.expires_in) ||
    value.expires_in <= 0 ||
    value.expires_in > 900
  ) {
    throw new Error("invalid_relay_token_response");
  }
  return value;
}

function loadedCredential(value: unknown): StoredCredential | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.status === "refreshing") return { status: "refreshing" };
  if (
    record.status === "ready" &&
    typeof record.refreshToken === "string" &&
    record.refreshToken
  ) {
    return { status: "ready", refreshToken: record.refreshToken };
  }
  return null;
}

export function createExtensionManagedRelayCredentials(
  options: CredentialOptions
) {
  const now = options.now ?? Date.now;
  const randomBytes =
    options.randomBytes ??
    ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const digest =
    options.digest ??
    (async (bytes: Uint8Array) =>
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes as BufferSource)
      ));
  const restricted = options.storage.restrict();
  const access = new Map<string, { token: string; expiresAt: number }>();
  const renewable = new Map<string, StoredCredential>();
  const flights = new Map<string, Promise<string | null>>();
  const loginFlights = new Map<string, Promise<void>>();
  const warnings = new Set<string>();
  const locks = new Map<string, Promise<void>>();
  const generations = new Map<string, number>();

  function nextGeneration(url: string): number {
    const next = (generations.get(url) ?? 0) + 1;
    generations.set(url, next);
    return next;
  }

  function withEndpointLock<Result>(
    url: string,
    operation: () => Promise<Result>
  ): Promise<Result> {
    const prior = locks.get(url) ?? Promise.resolve();
    const result = prior.then(operation);
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    locks.set(url, settled);
    void settled.then(() => {
      if (locks.get(url) === settled) locks.delete(url);
    });
    return result;
  }

  function key(discoveryUrl: string): string {
    return (
      MANAGED_RELAY_CREDENTIAL_PREFIX + canonicalDiscoveryUrl(discoveryUrl)
    );
  }

  function requireRegisteredRedirect(): string {
    const id = options.identity.extensionId;
    const expected = options.registeredExtensionId;
    const redirect = `https://${id}.chromiumapp.org/clipp-relay`;
    if (
      !/^[a-p]{32}$/.test(id) ||
      id !== expected ||
      options.identity.redirectUrl !== redirect
    ) {
      throw new Error("unregistered_extension_id");
    }
    return redirect;
  }

  async function read(discoveryUrl: string): Promise<StoredCredential | null> {
    await restricted;
    const cached = renewable.get(discoveryUrl);
    if (cached) return cached;
    const stored = await options.storage.read(key(discoveryUrl));
    const parsed = loadedCredential(stored);
    if (stored != null && !parsed)
      await options.storage.remove(key(discoveryUrl));
    return parsed;
  }

  async function save(
    discoveryUrl: string,
    token: TokenResponse
  ): Promise<string> {
    const value: StoredCredential = {
      status: "ready",
      refreshToken: token.refresh_token,
    };
    renewable.set(discoveryUrl, value);
    access.set(discoveryUrl, {
      token: token.access_token,
      expiresAt: now() + token.expires_in * 1000,
    });
    try {
      await options.storage.write(key(discoveryUrl), value);
      warnings.delete(discoveryUrl);
    } catch {
      warnings.add(discoveryUrl);
    }
    return token.access_token;
  }

  async function refresh(discoveryUrl: string): Promise<string | null> {
    return withEndpointLock(discoveryUrl, async () => {
      const credential = await read(discoveryUrl);
      if (!credential || credential.status !== "ready") return null;
      // Durable marker makes a service-worker crash or uncertain HTTP response fail closed.
      await options.storage.write(key(discoveryUrl), {
        status: "refreshing",
      } satisfies StoredCredential);
      renewable.set(discoveryUrl, { status: "refreshing" });
      const form = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "extension",
        refresh_token: credential.refreshToken,
      });
      try {
        return await save(
          discoveryUrl,
          requireToken(
            await options.fetchToken(tokenEndpoint(discoveryUrl), form)
          )
        );
      } catch {
        return null;
      }
    });
  }

  function singleFlight(
    discoveryUrl: string,
    operation: () => Promise<string | null>
  ): Promise<string | null> {
    const pending = flights.get(discoveryUrl);
    if (pending) return pending;
    const flight = operation().finally(() => {
      flights.delete(discoveryUrl);
    });
    flights.set(discoveryUrl, flight);
    return flight;
  }

  return {
    warning(discoveryUrl: string): string | undefined {
      return warnings.has(canonicalDiscoveryUrl(discoveryUrl))
        ? "Credential save failed. Login will be required after restart."
        : undefined;
    },
    async accessToken(
      discoveryUrl: string,
      options?: { forceRefresh?: boolean }
    ): Promise<string | null> {
      const url = canonicalDiscoveryUrl(discoveryUrl);
      const cached = access.get(url);
      if (!options?.forceRefresh && cached && cached.expiresAt - now() > 15_000)
        return cached.token;
      return singleFlight(url, () => refresh(url));
    },
    async interactiveLogin(discoveryUrl: string): Promise<void> {
      const url = canonicalDiscoveryUrl(discoveryUrl);
      const pending = loginFlights.get(url);
      if (pending) return pending;
      const login = (async () => {
        const redirect = requireRegisteredRedirect();
        await restricted;
        const generation = nextGeneration(url);
        const state = encodeBase64Url(randomBytes(32));
        const verifier = encodeBase64Url(randomBytes(32));
        const challenge = encodeBase64Url(
          await digest(new TextEncoder().encode(verifier))
        );
        const authorization = new URL(authorizeEndpoint(url));
        authorization.search = new URLSearchParams({
          response_type: "code",
          client_id: "extension",
          redirect_uri: redirect,
          code_challenge_method: "S256",
          code_challenge: challenge,
          state,
        }).toString();
        const result = await options.identity.launch(authorization.href);
        if (!result) throw new Error("relay_login_cancelled");
        let callback: URL;
        try {
          callback = new URL(result);
        } catch {
          throw new Error("invalid_relay_callback");
        }
        if (
          `${callback.origin}${callback.pathname}` !== redirect ||
          callback.hash ||
          callback.username ||
          callback.password
        ) {
          throw new Error("invalid_relay_callback");
        }
        if (
          callback.searchParams.get("state") !== state ||
          callback.searchParams.getAll("state").length !== 1
        ) {
          throw new Error("relay_state_mismatch");
        }
        if (callback.searchParams.has("error"))
          throw new Error("relay_access_denied");
        const code = callback.searchParams.get("code");
        if (
          !code ||
          callback.searchParams.getAll("code").length !== 1 ||
          [...callback.searchParams.keys()].some(
            (name) => name !== "code" && name !== "state"
          )
        ) {
          throw new Error("invalid_relay_callback");
        }
        await withEndpointLock(url, async () => {
          if (generations.get(url) !== generation)
            throw new Error("relay_login_superseded");
          await options.storage.write(key(url), {
            status: "refreshing",
          } satisfies StoredCredential);
          renewable.set(url, { status: "refreshing" });
          const form = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: "extension",
            redirect_uri: redirect,
            code,
            code_verifier: verifier,
          });
          await save(
            url,
            requireToken(await options.fetchToken(tokenEndpoint(url), form))
          );
        });
      })().finally(() => {
        loginFlights.delete(url);
      });
      loginFlights.set(url, login);
      return login;
    },
    async eraseCredentials(discoveryUrl: string): Promise<void> {
      const url = canonicalDiscoveryUrl(discoveryUrl);
      nextGeneration(url);
      await restricted;
      access.delete(url);
      await withEndpointLock(url, async () => {
        renewable.delete(url);
        warnings.delete(url);
        await options.storage.remove(key(url));
      });
    },
    async openAccount(discoveryUrl: string): Promise<void> {
      await options.identity.open(
        new URL("/", canonicalDiscoveryUrl(discoveryUrl)).href
      );
    },
  };
}
