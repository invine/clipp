const GUARDED_PROCESS_SEND_QUEUE = Symbol("clipp.guardedProcessSendQueue");
const PENDING_SEND_ERROR = Symbol("clipp.pendingSendError");

type MessageStreamLike = {
  send?: (data: Uint8Array) => boolean | undefined;
  onDrain?: () => Promise<void>;
  close?: (options?: unknown) => Promise<void>;
  abort?: (err: unknown) => void;
  processSendQueue?: (...args: unknown[]) => unknown;
  [GUARDED_PROCESS_SEND_QUEUE]?: boolean;
  [PENDING_SEND_ERROR]?: unknown;
};

export function isClosedDataChannelSendError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  return (
    message.includes("datachannel is closed") ||
    message.includes("data channel is closed") ||
    message.includes("rtcdatachannel.readystate is not 'open'") ||
    message.includes("invalid datachannel state")
  );
}

export function guardMessageStream<T extends MessageStreamLike>(stream: T): T {
  if (!stream || stream[GUARDED_PROCESS_SEND_QUEUE]) {
    return stream;
  }

  const originalProcessSendQueue = stream.processSendQueue;
  if (typeof originalProcessSendQueue === "function") {
    stream.processSendQueue = function guardedProcessSendQueue(
      this: MessageStreamLike,
      ...args: unknown[]
    ) {
      try {
        return originalProcessSendQueue.apply(this, args);
      } catch (err) {
        if (!isClosedDataChannelSendError(err)) {
          throw err;
        }
        setPendingSendError(stream, this, err);
        abortStream(this, err);
        return false;
      }
    };
  }

  stream[GUARDED_PROCESS_SEND_QUEUE] = true;
  return stream;
}

export async function writeMessageStream(stream: MessageStreamLike, data: Uint8Array): Promise<void> {
  guardMessageStream(stream);
  if (typeof stream?.send !== "function") {
    throw new Error("message stream is not writable (missing send)");
  }

  let ok: boolean | undefined;
  try {
    ok = stream.send(data);
  } catch (err) {
    if (isClosedDataChannelSendError(err)) {
      setPendingSendError(stream, stream, err);
      abortStream(stream, err);
    }
    throw err;
  }

  if (ok === false && typeof stream.onDrain === "function") {
    await stream.onDrain();
  }
  throwPendingSendError(stream);
}

export async function closeMessageStream(
  stream: MessageStreamLike | undefined,
  options: { ignoreClosedDataChannel?: boolean } = {}
): Promise<void> {
  if (typeof stream?.close !== "function") return;
  try {
    await stream.close();
  } catch (err) {
    if (options.ignoreClosedDataChannel && isClosedDataChannelSendError(err)) {
      return;
    }
    throw err;
  }
}

function setPendingSendError(
  stream: MessageStreamLike,
  receiver: MessageStreamLike | undefined,
  err: unknown
): void {
  stream[PENDING_SEND_ERROR] = err;
  if (receiver && receiver !== stream) {
    receiver[PENDING_SEND_ERROR] = err;
  }
}

function throwPendingSendError(stream: MessageStreamLike): void {
  const err = stream[PENDING_SEND_ERROR];
  if (err) {
    stream[PENDING_SEND_ERROR] = undefined;
    throw err;
  }
}

function abortStream(stream: MessageStreamLike | undefined, err: unknown): void {
  try {
    stream?.abort?.(err);
  } catch {
    // ignore cleanup failures after the underlying data channel has already closed
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "");
}
