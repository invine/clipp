import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { canonicalDiscoveryUrl } from "../../../packages/core/network/managedRelays.js";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
};

type CredentialStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

type Protection = {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

type Options = {
  storage: CredentialStorage;
  protection: Protection;
  openExternal(url: string): Promise<void>;
  postToken?(url: string, params: URLSearchParams): Promise<unknown>;
  now?(): number;
};

type Credential = { refresh: string; access: string; accessExpiresAt: number };
const warning =
  "Credential is held in memory only; sign in again after restart.";

class TokenExchangeError extends Error {
  constructor(readonly httpStatus: number) {
    super(
      httpStatus === 400 || httpStatus === 401
        ? "invalid_credentials"
        : "token_exchange_failed"
    );
  }
}

/** Keep only allowlisted diagnostics; error messages can contain credentials. */
function renewalFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return "token_exchange_failed";
  const status = (error as Error & { httpStatus?: unknown }).httpStatus;
  if (
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
  )
    return `HTTP ${status}`;
  if (error.name === "TimeoutError") return "network_timeout";
  if (error.name === "AbortError") return "request_aborted";
  const cause = (error as Error & { cause?: { code?: unknown } }).cause;
  switch (cause?.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "dns_lookup_failed";
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
    case "UND_ERR_HEADERS_TIMEOUT":
    case "UND_ERR_BODY_TIMEOUT":
      return "network_timeout";
    case "ECONNRESET":
    case "UND_ERR_SOCKET":
      return "connection_reset";
    case "ECONNREFUSED":
      return "connection_refused";
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return "tls_verification_failed";
  }
  if (
    [
      "invalid_credentials",
      "invalid_token_response",
      "token_response_too_large",
    ].includes(error.message)
  )
    return error.message;
  if (error instanceof SyntaxError) return "invalid_token_response";
  return "token_exchange_failed";
}

function tokenEndpoint(discoveryUrl: string): string {
  return new URL("/oauth/token", discoveryUrl).href;
}

function parseTokens(value: unknown): TokenResponse {
  if (!value || typeof value !== "object")
    throw new Error("invalid_token_response");
  const token = value as Record<string, unknown>;
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    typeof token.refresh_token !== "string" ||
    !token.refresh_token ||
    token.token_type !== "Bearer" ||
    !Number.isSafeInteger(token.expires_in) ||
    (token.expires_in as number) < 1 ||
    (token.expires_in as number) > 900
  )
    throw new Error("invalid_token_response");
  return token as TokenResponse;
}

async function postToken(
  url: string,
  params: URLSearchParams
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new TokenExchangeError(response.status);
  if (
    response.headers.get("content-length") &&
    Number(response.headers.get("content-length")) > 16_384
  )
    throw new Error("token_response_too_large");
  const text = await response.text();
  if (text.length > 16_384) throw new Error("token_response_too_large");
  return JSON.parse(text);
}

export function createElectronManagedRelayAuth(options: Options) {
  const now = options.now ?? Date.now;
  const credentials = new Map<string, Credential>();
  const loaded = new Set<string>();
  const credentialGeneration = new Map<string, number>();
  const writes = new Map<string, Set<Promise<void>>>();
  const warnings = new Map<string, string>();
  const refreshFlights = new Map<string, Promise<string | null>>();
  const logins = new Map<string, Promise<void>>();
  const listeners = new Map<string, Server>();
  const cancelPending = new Map<string, (error: Error) => void>();
  const loginGeneration = new Map<string, number>();
  const requestTokens = options.postToken ?? postToken;

  async function trackWrite(url: string, write: Promise<void>): Promise<void> {
    const pending = writes.get(url) ?? new Set<Promise<void>>();
    pending.add(write);
    writes.set(url, pending);
    try {
      await write;
    } finally {
      pending.delete(write);
      if (pending.size === 0 && writes.get(url) === pending) writes.delete(url);
    }
  }

  function key(url: string): string {
    return `managedRelayRefresh:${encodeURIComponent(canonicalDiscoveryUrl(url))}`;
  }

  function canPersist(): boolean {
    try {
      if (!options.protection.isEncryptionAvailable()) return false;
      const backend = options.protection.getSelectedStorageBackend?.();
      return (
        backend !== "basic_text" &&
        !(process.platform === "linux" && backend === "unknown")
      );
    } catch {
      return false;
    }
  }

  async function load(url: string): Promise<void> {
    url = canonicalDiscoveryUrl(url);
    if (loaded.has(url)) return;
    const generation = credentialGeneration.get(url) ?? 0;
    const stored = await options.storage.get(key(url));
    if ((credentialGeneration.get(url) ?? 0) !== generation) return;
    loaded.add(url);
    if (!stored) return;
    if (!canPersist()) {
      await options.storage.delete(key(url));
      warnings.set(url, warning);
      return;
    }
    try {
      const refresh = options.protection.decryptString(
        Buffer.from(stored, "base64")
      );
      if (!refresh) throw new Error("empty_credential");
      credentials.set(url, { refresh, access: "", accessExpiresAt: 0 });
    } catch {
      await options.storage.delete(key(url));
      warnings.set(url, "Saved credential could not be read; sign in again.");
    }
  }

  async function acceptTokens(url: string, raw: unknown): Promise<void> {
    url = canonicalDiscoveryUrl(url);
    const token = parseTokens(raw);
    const generation = credentialGeneration.get(url) ?? 0;
    credentials.set(url, {
      refresh: token.refresh_token,
      access: token.access_token,
      accessExpiresAt: now() + token.expires_in * 1_000,
    });
    loaded.add(url);
    await saveRefresh(url, token.refresh_token, generation);
  }

  async function saveRefresh(
    url: string,
    refresh: string,
    generation: number
  ): Promise<void> {
    const write = (async () => {
      if (!canPersist()) {
        await options.storage.delete(key(url));
        if ((credentialGeneration.get(url) ?? 0) === generation)
          warnings.set(url, warning);
        return;
      }
      try {
        await options.storage.set(
          key(url),
          options.protection.encryptString(refresh).toString("base64")
        );
        if ((credentialGeneration.get(url) ?? 0) === generation)
          warnings.delete(url);
      } catch {
        await options.storage.delete(key(url)).catch(() => undefined);
        if ((credentialGeneration.get(url) ?? 0) === generation)
          warnings.set(url, warning);
      }
    })();
    await trackWrite(url, write);
  }

  async function accessToken(url: string): Promise<string | null> {
    url = canonicalDiscoveryUrl(url);
    await load(url);
    const credential = credentials.get(url);
    if (credential?.access && credential.accessExpiresAt > now() + 30_000)
      return credential.access;
    const existing = refreshFlights.get(url);
    if (existing) return existing;
    if (!credential) return null;
    const generation = credentialGeneration.get(url) ?? 0;
    const flight = (async () => {
      // A refresh is single-use. Remove the old generation before any ambiguous network outcome.
      credentials.delete(url);
      try {
        await trackWrite(url, options.storage.delete(key(url)));
      } catch {
        warnings.set(url, "Could not erase old credential; sign in again.");
        return null;
      }
      let responseReceived = false;
      try {
        const token = await requestTokens(
          tokenEndpoint(url),
          new URLSearchParams({
            grant_type: "refresh_token",
            client_id: "electron",
            refresh_token: credential.refresh,
          })
        );
        responseReceived = true;
        if ((credentialGeneration.get(url) ?? 0) !== generation) return null;
        await acceptTokens(url, token);
        return (credentialGeneration.get(url) ?? 0) === generation
          ? (credentials.get(url)?.access ?? null)
          : null;
      } catch (error) {
        if ((credentialGeneration.get(url) ?? 0) !== generation) return null;
        const reason = renewalFailureReason(error);
        if (!responseReceived && reason === "dns_lookup_failed") {
          // DNS failed before the token POST could reach the relay. This
          // generation is still unused; retain it for the controller's backoff.
          // Timeouts, resets and HTTP errors remain ambiguous and are not replayed.
          credentials.set(url, credential);
          await saveRefresh(url, credential.refresh, generation);
          if ((credentialGeneration.get(url) ?? 0) !== generation) return null;
          const storageWarning = warnings.get(url);
          warnings.set(
            url,
            `Credential renewal failed (${reason}); retrying automatically.${storageWarning ? ` ${storageWarning}` : ""}`
          );
          throw new Error(reason);
        }
        warnings.set(
          url,
          `Credential renewal failed (${reason}); sign in again.`
        );
        return null;
      }
    })();
    refreshFlights.set(url, flight);
    try {
      return await flight;
    } finally {
      refreshFlights.delete(url);
    }
  }

  async function erase(url: string): Promise<void> {
    url = canonicalDiscoveryUrl(url);
    credentialGeneration.set(url, (credentialGeneration.get(url) ?? 0) + 1);
    cancel(url);
    credentials.delete(url);
    warnings.delete(url);
    loaded.add(url);
    await Promise.allSettled([...(writes.get(url) ?? [])]);
    await options.storage.delete(key(url));
  }

  async function interactiveLogin(url: string): Promise<void> {
    url = canonicalDiscoveryUrl(url);
    const existing = logins.get(url);
    if (existing) return existing;
    const generation = loginGeneration.get(url) ?? 0;
    const credentialVersion = (credentialGeneration.get(url) ?? 0) + 1;
    credentialGeneration.set(url, credentialVersion);
    const login = (async () => {
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const state = randomBytes(32).toString("base64url");
      let server: Server | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let callbackUsed = false;
      try {
        const code = await new Promise<{ code: string; redirect: string }>(
          (resolve, reject) => {
            server = createServer((request, response) => {
              const address = server?.address();
              const port =
                address && typeof address !== "string" ? address.port : 0;
              const redirect = `http://127.0.0.1:${port}/oauth/callback`;
              const rejectCallback = () => {
                response
                  .writeHead(400, { "Cache-Control": "no-store" })
                  .end("Invalid authorization callback");
              };
              if (
                callbackUsed ||
                request.method !== "GET" ||
                request.headers.host !== `127.0.0.1:${port}` ||
                !request.url
              ) {
                rejectCallback();
                return;
              }
              let incoming: URL;
              try {
                incoming = new URL(request.url, redirect);
              } catch {
                rejectCallback();
                return;
              }
              if (
                incoming.pathname !== "/oauth/callback" ||
                incoming.hash ||
                incoming.searchParams.getAll("state").length !== 1 ||
                incoming.searchParams.get("state") !== state
              ) {
                rejectCallback();
                return;
              }
              if (
                incoming.searchParams.getAll("error").length === 1 &&
                incoming.searchParams.get("error") === "access_denied" &&
                incoming.searchParams.size === 2
              ) {
                callbackUsed = true;
                warnings.set(
                  url,
                  "Relay account access is pending or unavailable. Manage the account in the relay portal, then try again."
                );
                response
                  .writeHead(200, {
                    "Cache-Control": "no-store",
                    "Content-Type": "text/plain",
                  })
                  .end(
                    "Relay account access is pending or unavailable. Manage the account in the relay portal, then try again."
                  );
                server?.close();
                reject(new Error("access_denied"));
                return;
              }
              if (
                incoming.searchParams.getAll("code").length !== 1 ||
                !incoming.searchParams.get("code") ||
                incoming.searchParams.size !== 2
              ) {
                rejectCallback();
                return;
              }
              callbackUsed = true;
              response
                .writeHead(200, {
                  "Cache-Control": "no-store",
                  "Content-Type": "text/plain",
                })
                .end("Clipp authorization received. You may close this tab.");
              server?.close();
              resolve({ code: incoming.searchParams.get("code")!, redirect });
            });
            listeners.set(url, server);
            cancelPending.set(url, reject);
            server.once("error", reject);
            server.listen(0, "127.0.0.1", async () => {
              const address = server?.address();
              if (
                !address ||
                typeof address === "string" ||
                address.port < 1024
              ) {
                reject(new Error("invalid_callback_port"));
                return;
              }
              const redirect = `http://127.0.0.1:${address.port}/oauth/callback`;
              const authorize = new URL("/oauth/authorize", url);
              authorize.search = new URLSearchParams({
                response_type: "code",
                client_id: "electron",
                redirect_uri: redirect,
                code_challenge_method: "S256",
                code_challenge: challenge,
                state,
              }).toString();
              try {
                await options.openExternal(authorize.href);
              } catch (error) {
                reject(error);
              }
            });
            timer = setTimeout(
              () => reject(new Error("authorization_timeout")),
              600_000
            );
          }
        );
        const token = await requestTokens(
          tokenEndpoint(url),
          new URLSearchParams({
            grant_type: "authorization_code",
            client_id: "electron",
            code: code.code,
            redirect_uri: code.redirect,
            code_verifier: verifier,
          })
        );
        await Promise.allSettled([...(writes.get(url) ?? [])]);
        if (
          (loginGeneration.get(url) ?? 0) !== generation ||
          (credentialGeneration.get(url) ?? 0) !== credentialVersion
        )
          throw new Error("authorization_cancelled");
        await acceptTokens(url, token);
      } finally {
        if (timer) clearTimeout(timer);
        server?.close();
        listeners.delete(url);
        cancelPending.delete(url);
      }
    })();
    logins.set(url, login);
    try {
      return await login;
    } finally {
      logins.delete(url);
    }
  }

  function cancel(url: string): void {
    loginGeneration.set(url, (loginGeneration.get(url) ?? 0) + 1);
    cancelPending.get(url)?.(new Error("authorization_cancelled"));
    listeners.get(url)?.close();
    listeners.delete(url);
    cancelPending.delete(url);
  }

  function cancelAll(): void {
    for (const url of [...logins.keys()]) cancel(url);
  }

  return {
    accessToken,
    acceptTokens,
    interactiveLogin,
    erase,
    cancelAll,
    warning: (url: string) => warnings.get(canonicalDiscoveryUrl(url)),
  };
}
