import { canonicalDiscoveryUrl } from "@core/network/managedRelays";

/** This value is also pinned by AndroidManifest.xml and the relay public-client configuration. */
export const ANDROID_RELAY_REDIRECT = "clipp-relay://oauth/callback";
const LOGIN_LIFETIME_MS = 10 * 60_000;

export type AndroidRelaySecretBridge = {
  readCredential(discoveryUrl: string): Promise<string | null>;
  writeCredential(discoveryUrl: string, credential: string): Promise<void>;
  eraseCredential(discoveryUrl: string): Promise<void>;
  openBrowser(url: string): Promise<void>;
  postToken?(
    discoveryUrl: string,
    form: string
  ): Promise<{ status: number; body: string }>;
};

type PendingLogin = {
  endpoint: string;
  state: string;
  verifier: string;
  startedAt: number;
  resolve(): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

type Access = { token: string; expiresAt: number };

function randomBase64Url(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function challenge(verifier: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  return btoa(String.fromCharCode(...hash))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function oauthUrl(endpoint: string, path: string): string {
  const url = new URL(canonicalDiscoveryUrl(endpoint));
  url.pathname = path;
  return url.href;
}

async function tokenResponse(response: Response): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  if (!response.ok)
    throw new Error(
      response.status === 400 || response.status === 401
        ? "invalid_credentials"
        : "token_exchange_failed"
    );
  const length = Number(response.headers.get("content-length"));
  if (length > 16_384) throw new Error("token_response_too_large");
  const body = await response.text();
  if (body.length > 16_384) throw new Error("token_response_too_large");
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== "object")
    throw new Error("invalid_token_response");
  const token = value as Record<string, unknown>;
  if (
    token.token_type !== "Bearer" ||
    typeof token.access_token !== "string" ||
    !token.access_token ||
    typeof token.refresh_token !== "string" ||
    !token.refresh_token ||
    !Number.isSafeInteger(token.expires_in) ||
    (token.expires_in as number) <= 0 ||
    (token.expires_in as number) > 900
  )
    throw new Error("invalid_token_response");
  return token as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

/** Activity-owned credentials and browser flow. No renewable credential enters ordinary Preferences. */
export class AndroidManagedRelayAuth {
  private pending: PendingLogin | null = null;
  private loginPreparing = false;
  private readonly access = new Map<string, Access>();
  private readonly renewable = new Map<string, string>();
  private readonly flights = new Map<string, Promise<string | null>>();
  private readonly loginFlights = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();
  private readonly credentialTurns = new Map<string, Promise<void>>();
  private readonly warnings = new Map<string, string>();

  constructor(
    private readonly bridge: AndroidRelaySecretBridge,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  warning(endpoint: string): string | undefined {
    return this.warnings.get(endpoint);
  }

  private async serializedCredential<T>(
    endpoint: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.credentialTurns.get(endpoint);
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.credentialTurns.set(endpoint, turn);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.credentialTurns.get(endpoint) === turn)
        this.credentialTurns.delete(endpoint);
    }
  }

  async accessToken(
    endpoint: string,
    signal: AbortSignal
  ): Promise<string | null> {
    endpoint = canonicalDiscoveryUrl(endpoint);
    const cached = this.access.get(endpoint);
    if (cached && cached.expiresAt - this.now() > 60_000) return cached.token;
    const existing = this.flights.get(endpoint);
    if (existing) return existing;
    const flight = this.refresh(endpoint, signal);
    this.flights.set(endpoint, flight);
    try {
      return await flight;
    } finally {
      if (this.flights.get(endpoint) === flight) this.flights.delete(endpoint);
    }
  }

  private async refresh(
    endpoint: string,
    signal: AbortSignal
  ): Promise<string | null> {
    const generation = this.generations.get(endpoint) ?? 0;
    let old = this.renewable.get(endpoint);
    if (!old) {
      try {
        old = (await this.bridge.readCredential(endpoint)) ?? undefined;
      } catch {
        await this.serializedCredential(endpoint, async () => {
          if ((this.generations.get(endpoint) ?? 0) !== generation) return;
          await this.bridge.eraseCredential(endpoint);
          this.warnings.set(
            endpoint,
            "Stored relay credentials could not be read. Log in again."
          );
        });
        return null;
      }
    }
    if ((this.generations.get(endpoint) ?? 0) !== generation) return null;
    if (!old) return null;
    // A refresh can consume its input even when the response or later save fails.
    // Remove the durable old token before sending it, so restart cannot replay it.
    const erased = await this.serializedCredential(endpoint, async () => {
      if ((this.generations.get(endpoint) ?? 0) !== generation) return false;
      await this.bridge.eraseCredential(endpoint);
      return true;
    });
    if (!erased || (this.generations.get(endpoint) ?? 0) !== generation)
      return null;
    this.renewable.delete(endpoint);
    let result: Awaited<ReturnType<typeof tokenResponse>>;
    try {
      result = await this.postToken(
        endpoint,
        {
          grant_type: "refresh_token",
          client_id: "android",
          refresh_token: old,
        },
        signal
      );
    } catch (error) {
      if ((this.generations.get(endpoint) ?? 0) !== generation) return null;
      this.access.delete(endpoint);
      if (error instanceof Error && error.message === "invalid_credentials")
        return null;
      throw error;
    }
    if ((this.generations.get(endpoint) ?? 0) !== generation) return null;
    this.renewable.set(endpoint, result.refresh_token);
    this.access.set(endpoint, {
      token: result.access_token,
      expiresAt: this.now() + result.expires_in * 1000,
    });
    try {
      await this.serializedCredential(endpoint, async () => {
        if ((this.generations.get(endpoint) ?? 0) !== generation) return;
        await this.bridge.writeCredential(endpoint, result.refresh_token);
        if ((this.generations.get(endpoint) ?? 0) === generation)
          this.warnings.delete(endpoint);
      });
    } catch {
      if ((this.generations.get(endpoint) ?? 0) === generation)
        this.warnings.set(
          endpoint,
          "Relay credential is held only in memory. Log in again after restart."
        );
    }
    if ((this.generations.get(endpoint) ?? 0) !== generation) return null;
    return result.access_token;
  }

  private async postToken(
    endpoint: string,
    fields: Record<string, string>,
    signal?: AbortSignal
  ) {
    const form = new URLSearchParams(fields).toString();
    if (signal?.aborted) throw new Error("aborted");
    const nativeResponse = this.bridge.postToken
      ? await this.bridge.postToken(endpoint, form)
      : null;
    if (signal?.aborted) throw new Error("aborted");
    const response = nativeResponse
      ? new Response(nativeResponse.body, { status: nativeResponse.status })
      : await this.fetcher(oauthUrl(endpoint, "/oauth/token"), {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
          signal,
        });
    return tokenResponse(response);
  }

  async login(endpoint: string): Promise<void> {
    endpoint = canonicalDiscoveryUrl(endpoint);
    if (this.pending || this.loginPreparing)
      throw new Error("login_already_pending");
    this.loginPreparing = true;
    const generation = this.generations.get(endpoint) ?? 0;
    let state: string;
    let verifier: string;
    let codeChallenge: string;
    try {
      state = randomBase64Url();
      verifier = randomBase64Url();
      codeChallenge = await challenge(verifier);
      if ((this.generations.get(endpoint) ?? 0) !== generation)
        throw new Error("login_cancelled");
    } finally {
      this.loginPreparing = false;
    }
    const authorize = new URL(oauthUrl(endpoint, "/oauth/authorize"));
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: "android",
      redirect_uri: ANDROID_RELAY_REDIRECT,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      state,
    }).toString();
    let pending!: PendingLogin;
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending === pending) this.pending = null;
        reject(new Error("login_expired"));
      }, LOGIN_LIFETIME_MS);
      pending = {
        endpoint,
        state,
        verifier,
        startedAt: this.now(),
        resolve,
        reject,
        timer,
      };
    });
    this.pending = pending;
    try {
      await this.bridge.openBrowser(authorize.href);
    } catch (error) {
      clearTimeout(pending.timer);
      pending.reject(
        error instanceof Error ? error : new Error("browser_open_failed")
      );
      this.pending = null;
    }
    return done;
  }

  async acceptCallback(raw: string): Promise<boolean> {
    const pending = this.pending;
    if (!pending || this.now() - pending.startedAt >= LOGIN_LIFETIME_MS) {
      if (pending) {
        this.pending = null;
        clearTimeout(pending.timer);
        pending.reject(new Error("login_expired"));
      }
      return false;
    }
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    if (
      `${url.protocol}//${url.host}${url.pathname}` !==
        ANDROID_RELAY_REDIRECT ||
      url.hash ||
      url.username ||
      url.password ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("state") !== pending.state
    )
      return false;
    const codes = url.searchParams.getAll("code");
    const errors = url.searchParams.getAll("error");
    if (
      (codes.length !== 1 || !codes[0]) &&
      (errors.length !== 1 || !errors[0])
    )
      return false;
    if (codes.length && errors.length) return false;
    if (
      [...url.searchParams.keys()].some(
        (key) => !["code", "state", "error"].includes(key)
      )
    )
      return false;
    this.pending = null;
    clearTimeout(pending.timer);
    if (errors.length) {
      pending.reject(new Error("authorization_denied"));
      return true;
    }
    // A newly accepted explicit login supersedes any refresh already in flight.
    // Its code exchange may finish before that older refresh response arrives.
    this.generations.set(
      pending.endpoint,
      (this.generations.get(pending.endpoint) ?? 0) + 1
    );
    const exchange = this.exchangeCallback(pending, codes[0]);
    this.loginFlights.set(pending.endpoint, exchange);
    try {
      await exchange;
      pending.resolve();
    } catch (error) {
      pending.reject(
        error instanceof Error ? error : new Error("token_exchange_failed")
      );
    } finally {
      if (this.loginFlights.get(pending.endpoint) === exchange)
        this.loginFlights.delete(pending.endpoint);
    }
    return true;
  }

  private async exchangeCallback(
    pending: PendingLogin,
    code: string
  ): Promise<void> {
    const generation = this.generations.get(pending.endpoint) ?? 0;
    // An existing grant must not remain durable if a new code consumes its replacement.
    await this.serializedCredential(pending.endpoint, async () => {
      if ((this.generations.get(pending.endpoint) ?? 0) !== generation)
        throw new Error("login_cancelled");
      await this.bridge.eraseCredential(pending.endpoint);
    });
    if ((this.generations.get(pending.endpoint) ?? 0) !== generation)
      throw new Error("login_cancelled");
    this.renewable.delete(pending.endpoint);
    this.access.delete(pending.endpoint);
    const result = await this.postToken(pending.endpoint, {
      grant_type: "authorization_code",
      client_id: "android",
      redirect_uri: ANDROID_RELAY_REDIRECT,
      code,
      code_verifier: pending.verifier,
    });
    if ((this.generations.get(pending.endpoint) ?? 0) !== generation)
      throw new Error("login_cancelled");
    this.renewable.set(pending.endpoint, result.refresh_token);
    this.access.set(pending.endpoint, {
      token: result.access_token,
      expiresAt: this.now() + result.expires_in * 1000,
    });
    try {
      await this.serializedCredential(pending.endpoint, async () => {
        if ((this.generations.get(pending.endpoint) ?? 0) !== generation)
          throw new Error("login_cancelled");
        await this.bridge.writeCredential(
          pending.endpoint,
          result.refresh_token
        );
        if ((this.generations.get(pending.endpoint) ?? 0) === generation)
          this.warnings.delete(pending.endpoint);
      });
    } catch {
      if ((this.generations.get(pending.endpoint) ?? 0) === generation)
        this.warnings.set(
          pending.endpoint,
          "Relay credential is held only in memory. Log in again after restart."
        );
    }
    if ((this.generations.get(pending.endpoint) ?? 0) !== generation)
      throw new Error("login_cancelled");
  }

  async openAccount(endpoint: string): Promise<void> {
    await this.bridge.openBrowser(
      new URL(canonicalDiscoveryUrl(endpoint)).origin + "/"
    );
  }

  async erase(endpoint: string): Promise<void> {
    endpoint = canonicalDiscoveryUrl(endpoint);
    this.generations.set(endpoint, (this.generations.get(endpoint) ?? 0) + 1);
    if (this.pending?.endpoint === endpoint) {
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      pending.reject(new Error("login_cancelled"));
    }
    await Promise.allSettled([
      this.flights.get(endpoint),
      this.loginFlights.get(endpoint),
    ]);
    this.access.delete(endpoint);
    this.renewable.delete(endpoint);
    this.warnings.delete(endpoint);
    await this.bridge.eraseCredential(endpoint);
  }
}
