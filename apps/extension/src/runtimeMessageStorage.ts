import type { KVStorageBackend } from "../../../packages/core/trust";
import { MANAGED_RELAY_CREDENTIAL_PREFIX } from "./managedRelayConstants";

const STORAGE_TARGET = "background";
const STORAGE_ACTION = "offscreenStorage";

export type OffscreenStorageResponse<Value = unknown> =
  { ok: true; value?: Value } | { ok: false; error: string };

type SendRuntimeMessage = (
  request: unknown,
  callback: (response: OffscreenStorageResponse | undefined) => void
) => void;

type RuntimeMessageSender = {
  id?: string;
  url?: string;
};

type OffscreenStorageHandlerOptions = {
  storage: KVStorageBackend;
  extensionId: string;
  offscreenUrl: string;
};

export class RuntimeMessageStorageBackend implements KVStorageBackend {
  constructor(
    private readonly sendMessage: SendRuntimeMessage = defaultSendRuntimeMessage,
    private readonly getLastError: () =>
      string | undefined = defaultRuntimeMessageError,
    private readonly timeoutMs: number = 10_000
  ) {}

  async get<Value = unknown>(key: string): Promise<Value | undefined> {
    return await this.request<Value>({
      target: STORAGE_TARGET,
      action: STORAGE_ACTION,
      operation: "get",
      key,
    });
  }

  async set<Value = unknown>(key: string, value: Value): Promise<void> {
    await this.request<void>({
      target: STORAGE_TARGET,
      action: STORAGE_ACTION,
      operation: "set",
      key,
      value,
    });
  }

  async remove(key: string): Promise<void> {
    await this.request<void>({
      target: STORAGE_TARGET,
      action: STORAGE_ACTION,
      operation: "remove",
      key,
    });
  }

  private async request<Value>(request: unknown): Promise<Value | undefined> {
    return await new Promise<Value | undefined>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("storage_proxy_timeout")),
        this.timeoutMs
      );
      try {
        this.sendMessage(request, (response) => {
          clearTimeout(timeout);
          const lastError = this.getLastError();
          if (lastError) {
            reject(new Error(lastError));
            return;
          }
          if (!response?.ok) {
            reject(
              new Error(response?.error ?? "storage_proxy_invalid_response")
            );
            return;
          }
          resolve(response.value as Value | undefined);
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
}

export async function handleOffscreenStorageRequest(
  request: unknown,
  sender: RuntimeMessageSender,
  options: OffscreenStorageHandlerOptions
): Promise<OffscreenStorageResponse | undefined> {
  if (!isOffscreenStorageRequest(request)) return undefined;
  if (
    sender.id !== options.extensionId ||
    sender.url !== options.offscreenUrl
  ) {
    return { ok: false, error: "storage_proxy_unauthorized" };
  }
  if (request.key.startsWith(MANAGED_RELAY_CREDENTIAL_PREFIX)) {
    return { ok: false, error: "storage_proxy_unauthorized" };
  }
  try {
    if (request.operation === "get") {
      return { ok: true, value: await options.storage.get(request.key) };
    }
    if (request.operation === "set") {
      await options.storage.set(request.key, request.value);
    } else {
      await options.storage.remove(request.key);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

type OffscreenStorageRequest =
  | {
      target: typeof STORAGE_TARGET;
      action: typeof STORAGE_ACTION;
      operation: "get" | "remove";
      key: string;
    }
  | {
      target: typeof STORAGE_TARGET;
      action: typeof STORAGE_ACTION;
      operation: "set";
      key: string;
      value: unknown;
    };

function isOffscreenStorageRequest(
  request: unknown
): request is OffscreenStorageRequest {
  if (!request || typeof request !== "object") return false;
  const candidate = request as Record<string, unknown>;
  const operationIsValid =
    candidate.operation === "get" ||
    candidate.operation === "remove" ||
    (candidate.operation === "set" && "value" in candidate);
  return (
    candidate.target === STORAGE_TARGET &&
    candidate.action === STORAGE_ACTION &&
    operationIsValid &&
    typeof candidate.key === "string"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "storage_proxy_failed";
}

function defaultSendRuntimeMessage(
  request: unknown,
  callback: (response: OffscreenStorageResponse | undefined) => void
): void {
  const runtime = globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        sendMessage?(
          message: unknown,
          callback: (response: OffscreenStorageResponse | undefined) => void
        ): void;
      };
    };
  };
  const chromeRuntime = runtime.chrome?.runtime;
  if (!chromeRuntime?.sendMessage)
    throw new Error("chrome_runtime_unavailable");
  chromeRuntime.sendMessage(request, callback);
}

function defaultRuntimeMessageError(): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { runtime?: { lastError?: { message?: string } } };
  };
  return runtime.chrome?.runtime?.lastError?.message;
}
