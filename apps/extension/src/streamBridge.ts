import type { MessageStreamHandler } from "../../../packages/core/messaging/transport";
import { isHistoryProtocol } from "../../../packages/core/protocols/history";

export type ExtensionStreamMessage =
  | { action: "runtimeStreamStart"; streamId: string; protocol: string; from: string }
  | { action: "runtimeStreamChunk"; streamId: string; data: number[] }
  | { action: "runtimeStreamEnd"; streamId: string }
  | { action: "runtimeStreamCancel"; streamId: string };

export type ExtensionStreamResponse = { ok: true } | { ok: false; error: string };

type SendStreamMessage = (message: ExtensionStreamMessage) => Promise<ExtensionStreamResponse>;

type OutboundExtensionStreamMessage =
  | {
      action: "runtimeSendStream";
      streamId: string;
      protocol: string;
      peerTarget: string;
      frames: number[][];
      idleTimeoutMs?: number;
    }
  | { action: "runtimeCancelSendStream"; streamId: string };

export function createExtensionStreamReceiver() {
  const handlers = new Map<string, MessageStreamHandler>();
  const streams = new Map<string, { chunks: RelayedChunks; handling: Promise<void> }>();

  return {
    onStream(protocol: string, handler: MessageStreamHandler): void {
      if (handlers.has(protocol)) throw new Error("stream_handler_already_registered");
      handlers.set(protocol, handler);
    },

    async handle(message: ExtensionStreamMessage): Promise<ExtensionStreamResponse> {
      try {
        if (message.action === "runtimeStreamStart") {
          if (streams.has(message.streamId)) throw new Error("stream_already_started");
          const handler = handlers.get(message.protocol);
          if (!handler) throw new Error("stream_handler_unavailable");
          const chunks = new RelayedChunks();
          const handling = Promise.resolve(handler(message.from, chunks)).then(
            () => chunks.consumerFinished(),
            (error) => {
              chunks.consumerFinished(error);
              throw error;
            },
          );
          void handling.catch(() => undefined);
          streams.set(message.streamId, { chunks, handling });
          return { ok: true };
        }

        const stream = streams.get(message.streamId);
        if (!stream) throw new Error("stream_not_started");
        if (message.action === "runtimeStreamChunk") {
          await stream.chunks.push(Uint8Array.from(message.data));
          return { ok: true };
        }
        if (message.action === "runtimeStreamEnd") {
          stream.chunks.end();
          await stream.handling;
          streams.delete(message.streamId);
          return { ok: true };
        }

        stream.chunks.cancel();
        await stream.handling.catch(() => undefined);
        streams.delete(message.streamId);
        return { ok: true };
      } catch (error) {
        streams.get(message.streamId)?.chunks.cancel();
        streams.delete(message.streamId);
        return { ok: false, error: errorMessage(error) };
      }
    },
  };
}

export async function relayExtensionStream(options: {
  protocol: string;
  from: string;
  chunks: AsyncIterable<Uint8Array>;
  send: SendStreamMessage;
  streamId?: string;
}): Promise<void> {
  const streamId = options.streamId ?? createStreamId();
  await expectSuccess(await options.send({
    action: "runtimeStreamStart",
    streamId,
    protocol: options.protocol,
    from: options.from,
  }));
  try {
    for await (const chunk of options.chunks) {
      await expectSuccess(await options.send({
        action: "runtimeStreamChunk",
        streamId,
        data: Array.from(chunk),
      }));
    }
    await expectSuccess(await options.send({ action: "runtimeStreamEnd", streamId }));
  } catch (error) {
    await options.send({ action: "runtimeStreamCancel", streamId }).catch(() => undefined);
    throw error;
  }
}

export async function sendBufferedExtensionStream(options: {
  protocol: string;
  target: string;
  frames: AsyncIterable<Uint8Array>;
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  streamId?: string;
  send(message: OutboundExtensionStreamMessage): Promise<unknown>;
}): Promise<void> {
  const streamId = options.streamId ?? createStreamId();
  const encoded: number[][] = [];
  const iterator = options.frames[Symbol.asyncIterator]();
  let iteratorCompleted = false;
  try {
    for (;;) {
      const next = await withProgressTimeout(
        iterator.next(),
        options.idleTimeoutMs,
        options.protocol,
        options.signal,
      );
      if (next.done) {
        iteratorCompleted = true;
        break;
      }
      if (!(next.value instanceof Uint8Array) || next.value.length === 0) {
        throw new Error("invalid_stream_frame");
      }
      encoded.push(Array.from(next.value));
    }
  } finally {
    const returning = iterator.return?.();
    if (returning) {
      if (iteratorCompleted) await returning.catch(() => undefined);
      else void returning.catch(() => undefined);
    }
  }

  const response = await withAbortSignal(
    options.send({
      action: "runtimeSendStream",
      streamId,
      protocol: options.protocol,
      peerTarget: options.target,
      frames: encoded,
      idleTimeoutMs: options.idleTimeoutMs,
    }),
    options.signal,
    () => { void options.send({ action: "runtimeCancelSendStream", streamId }); },
  );
  if (isFailedResponse(response)) throw new Error(response.error);
}

async function withProgressTimeout<T>(
  operation: Promise<T>,
  idleTimeoutMs: number | undefined,
  protocol: string,
  signal?: AbortSignal,
): Promise<T> {
  if (idleTimeoutMs === undefined) return await withAbortSignal(operation, signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await withAbortSignal(Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(
          isHistoryProtocol(protocol) ? "history_stream_timeout" : "stream_progress_timeout",
        )), idleTimeoutMs);
      }),
    ]), signal);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isExtensionStreamMessage(value: unknown): value is ExtensionStreamMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ExtensionStreamMessage>;
  if (typeof message.action !== "string" || typeof message.streamId !== "string") return false;
  if (message.action === "runtimeStreamStart") {
    return typeof message.protocol === "string" && typeof message.from === "string";
  }
  if (message.action === "runtimeStreamChunk") return Array.isArray(message.data);
  return message.action === "runtimeStreamEnd" || message.action === "runtimeStreamCancel";
}

class RelayedChunks implements AsyncIterable<Uint8Array> {
  private readonly queued: Array<{ value: Uint8Array; acknowledged: Deferred<void> }> = [];
  private waiting: Deferred<IteratorResult<Uint8Array>> | null = null;
  private currentAcknowledgement: Deferred<void> | null = null;
  private ended = false;
  private consumerError: Error | null = null;

  async push(value: Uint8Array): Promise<void> {
    if (this.consumerError) throw this.consumerError;
    if (this.ended) throw new Error("stream_already_ended");
    const acknowledged = deferred<void>();
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = null;
      this.currentAcknowledgement = acknowledged;
      waiting.resolve({ done: false, value });
    } else {
      this.queued.push({ value, acknowledged });
    }
    await acknowledged.promise;
  }

  end(): void {
    this.ended = true;
    if (this.waiting) {
      const waiting = this.waiting;
      this.waiting = null;
      waiting.resolve({ done: true, value: undefined });
    }
  }

  cancel(): void {
    this.consumerFinished(new Error("stream_cancelled"));
  }

  consumerFinished(error?: unknown): void {
    const failure = error instanceof Error ? error : error ? new Error(String(error)) : new Error("stream_not_consumed");
    this.consumerError = failure;
    this.currentAcknowledgement?.reject(failure);
    this.currentAcknowledgement = null;
    for (const item of this.queued.splice(0)) item.acknowledged.reject(failure);
    this.waiting?.reject(failure);
    this.waiting = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: async () => {
        this.currentAcknowledgement?.resolve();
        this.currentAcknowledgement = null;
        if (this.consumerError) throw this.consumerError;
        const queued = this.queued.shift();
        if (queued) {
          this.currentAcknowledgement = queued.acknowledged;
          return { done: false, value: queued.value };
        }
        if (this.ended) return { done: true, value: undefined };
        this.waiting = deferred<IteratorResult<Uint8Array>>();
        return await this.waiting.promise;
      },
    };
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function expectSuccess(response: ExtensionStreamResponse): void {
  if (!response.ok) throw new Error(response.error);
}

function createStreamId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withAbortSignal<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
  onAbort: () => void = () => undefined,
): Promise<T> {
  if (!signal) return await operation;
  if (signal.aborted) {
    onAbort();
    throw new Error("stream_cancelled");
  }
  let abortListener!: () => void;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        abortListener = () => {
          onAbort();
          reject(new Error("stream_cancelled"));
        };
        signal.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abortListener);
  }
}

function isFailedResponse(value: unknown): value is { ok: false; error: string } {
  return Boolean(value && typeof value === "object" && (value as { ok?: unknown }).ok === false);
}
