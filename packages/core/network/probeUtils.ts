import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { pipe } from "it-pipe";
import { PROTOCOL } from "./engine.js";
import {
  privateKeyFromProtobuf,
  privateKeyFromRaw,
  type PrivateKey,
} from "@libp2p/crypto/keys";

export type TrustRequestPayload = {
  deviceId: string;
  deviceName?: string;
  publicKey?: string;
  multiaddrs?: string[];
  createdAt?: number;
  [key: string]: unknown;
};

export type TrustRequestMessage = {
  type: "trust-request";
  from: string;
  payload: TrustRequestPayload;
  sentAt?: number;
};

export type TrustAckMessage = {
  type: "trust-ack";
  from: string;
  payload: Record<string, unknown>;
  sentAt?: number;
};

type HandlerCtx = { stream: any; node: any };

export function registerClipboardHandler(
  node: any,
  opts: {
    allowLimited?: boolean;
    onTrustRequest?: (
      msg: TrustRequestMessage,
      ctx: HandlerCtx
    ) => Promise<void> | void;
    onTrustAck?: (msg: TrustAckMessage, ctx: HandlerCtx) => void;
    logger?: (...args: any[]) => void;
  }
) {
  const allowLimited = opts.allowLimited !== false;
  const log = opts.logger || console.info;
  node.handle(
    PROTOCOL,
    async (data: any) => {
      const stream = data?.stream ?? data;
      const connection = data?.connection ?? (stream as any)?.connection;
      log("[probe-utils] handler attached for incoming messages", {
        stream: describeStream(stream),
        connection: connection ? safeConnStat(connection) : undefined,
      });
      const iterable = getStreamIterable(stream);
      if (!iterable) {
        log("[probe-utils] inbound stream missing async iterator", {
          stream: describeStream(stream),
          dataKeys: data ? Object.keys(data).sort() : undefined,
          connection: connection ? safeConnStat(connection) : undefined,
        });
        return;
      }
      for await (const chunk of iterable) {
        const buf = toU8(chunk);
        if (!buf) {
          log("[probe-utils] inbound chunk not a Uint8Array", {
            type: typeof chunk,
            ctor: (chunk as any)?.constructor?.name,
          });
          continue;
        }
        try {
          const msg = JSON.parse(new TextDecoder().decode(buf));
          log("[probe-utils] received message", msg);
          if (msg?.type === "trust-request") {
            await opts.onTrustRequest?.(msg, { stream, node });
          } else if (msg?.type === "trust-ack") {
            opts.onTrustAck?.(msg, { stream, node });
          }
        } catch (err: any) {
          log("[probe-utils] failed to parse inbound message", err?.message || err);
        }
      }
      log("[probe-utils] handler stream closed");
    },
    { runOnLimitedConnection: allowLimited }
  );
}

export async function sendTrustRequest(
  node: any,
  target: string | Multiaddr,
  payload: TrustRequestPayload,
  opts: { allowLimited?: boolean; logger?: (...args: any[]) => void } = {}
): Promise<TrustAckMessage | undefined> {
  const allowLimited = opts.allowLimited !== false;
  const log = opts.logger || console.info;
  const targetMa = typeof target === "string" ? multiaddr(target) : target;
  const deviceId = node.peerId.toString();
  const message: TrustRequestMessage = {
    type: "trust-request",
    from: deviceId,
    payload,
    sentAt: Date.now(),
  };

  log("[probe-utils] sending trust-request", {
    target: targetMa.toString(),
    payload,
  });

  const conn = await node.dialProtocol(targetMa, PROTOCOL, {
    runOnLimitedConnection: allowLimited,
  });
  log("[probe-utils] protocol stream opened", {
    target: targetMa.toString(),
    stat: safeStat(conn),
    protocol: conn?.protocol,
    timeline: conn?.timeline,
    stream: describeStream(conn),
    connection: safeConnStat((conn as any)?.connection),
  });

  try {
    await writeStream(conn, new TextEncoder().encode(JSON.stringify(message)), { end: true });
    log("[probe-utils] trust-request written", { target: targetMa.toString() });
  } catch (err: any) {
    log("[probe-utils] write failed", { target: targetMa.toString(), error: err?.message || err });
    throw err;
  }
  const iterable = getStreamIterable(conn);
  if (!iterable) {
    log("[probe-utils] outbound stream missing async iterator", {
      stream: describeStream(conn),
    });
    return undefined;
  }
  log("[probe-utils] waiting for trust-ack", { target: targetMa.toString() });
  for await (const chunk of iterable) {
    const buf = toU8(chunk);
    if (!buf) {
      log("[probe-utils] outbound stream received non-buffer chunk", { chunkType: typeof chunk });
      continue;
    }
    const raw = new TextDecoder().decode(buf);
    log("[probe-utils] outbound stream received chunk", {
      len: buf.length,
      preview: raw.slice(0, 160),
    });
    const msg = JSON.parse(raw);
    log("[probe-utils] outbound stream received", msg);
    if (msg?.type === "trust-ack") {
      log("[probe-utils] trust-ack received", msg);
      return msg as TrustAckMessage;
    }
  }
  log("[probe-utils] outbound stream ended without trust-ack");
  return undefined;
}

export function loadPrivateKeyFromEnv(envName = "PROBE_PRIVATE_KEY_BASE64"): PrivateKey | undefined {
  const b64 = process.env[envName];
  if (!b64) return undefined;
  try {
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    try {
      return privateKeyFromProtobuf(bytes);
    } catch {
      // fall through
    }
    return privateKeyFromRaw(bytes);
  } catch (err: any) {
    console.warn(
      "[probe-utils] failed to parse",
      envName,
      "; using ephemeral key",
      err?.message || err
    );
    return undefined;
  }
}

export function toU8(chunk: any): Uint8Array | null {
  if (chunk instanceof Uint8Array) return chunk;
  if (typeof (chunk as any)?.subarray === "function") {
    return (chunk as any).subarray();
  }
  if (
    typeof chunk === "object" &&
    chunk != null &&
    (chunk as any).bufs &&
    Array.isArray((chunk as any).bufs) &&
    typeof (chunk as any).subarray === "function"
  ) {
    return (chunk as any).subarray();
  }
  return null;
}

export function safeStat(stream: any) {
  if (!stream?.stat) return undefined;
  const { direction, timeline, protocol } = stream.stat;
  return {
    direction,
    protocol,
    timeline: timeline
      ? {
          open: timeline.open,
          close: timeline.close,
          reset: timeline.reset,
        }
      : undefined,
  };
}

export function safeConnStat(conn: any) {
  if (!conn?.stat) return undefined;
  const { direction, timeline, status } = conn.stat;
  return {
    direction,
    status,
    timeline: timeline
      ? {
          open: timeline.open,
          close: timeline.close,
          upgrade: timeline.upgrade,
        }
      : undefined,
  };
}

export function getStreamIterable(stream: any): AsyncIterable<any> | undefined {
  if (!stream) return undefined;
  if (typeof (stream as any)[Symbol.asyncIterator] === "function") {
    return stream as any;
  }
  const source = (stream as any)?.source;
  if (source && typeof source[Symbol.asyncIterator] === "function") {
    return source;
  }
  const inner = (stream as any)?.stream;
  if (inner && typeof inner[Symbol.asyncIterator] === "function") {
    return inner;
  }
  return undefined;
}

export function describeStream(stream: any) {
  if (!stream) return { missing: true };
  const keys = Object.keys(stream || {});
  const inner = (stream as any)?.stream;
  return {
    ctor: stream?.constructor?.name,
    keys,
    hasSink: typeof stream.sink === "function",
    hasWrite: typeof stream.write === "function",
    hasSend: typeof stream.send === "function",
    hasSource: Boolean((stream as any)?.source),
    hasIterable: typeof (stream as any)[Symbol.asyncIterator] === "function",
    inner: inner
      ? {
          ctor: inner?.constructor?.name,
          keys: Object.keys(inner || {}),
          hasSink: typeof inner.sink === "function",
          hasWrite: typeof inner.write === "function",
          hasSend: typeof inner.send === "function",
          hasSource: Boolean((inner as any)?.source),
          hasIterable: typeof (inner as any)[Symbol.asyncIterator] === "function",
        }
      : undefined,
  };
}

export async function writeStream(stream: any, data: Uint8Array, opts: { end?: boolean } = {}) {
  const shouldEnd = opts.end === true;
  const sinkTarget =
    stream && typeof stream.sink === "function"
      ? stream
      : stream?.stream && typeof stream.stream.sink === "function"
      ? stream.stream
      : undefined;
  if (sinkTarget) {
    console.info("[probe-utils] writeStream using sink", {
      stream: describeStream(stream),
    });
    await pipe([data], (source) => sinkTarget.sink(source));
    if (shouldEnd && typeof sinkTarget.close === "function") {
      await sinkTarget.close();
    }
    return;
  }

  const writeTarget =
    stream && typeof stream.write === "function"
      ? stream
      : stream?.stream && typeof stream.stream.write === "function"
      ? stream.stream
      : undefined;
  if (writeTarget) {
    console.info("[probe-utils] writeStream using write/closeWrite", {
      stream: describeStream(stream),
    });
    await writeTarget.write(data);
    if (shouldEnd) {
      if (typeof writeTarget.closeWrite === "function") {
        await writeTarget.closeWrite();
      } else if (typeof writeTarget.close === "function") {
        await writeTarget.close();
      }
    }
    return;
  }

  const sendTarget =
    stream && typeof stream.send === "function"
      ? stream
      : stream?.stream && typeof stream.stream.send === "function"
      ? stream.stream
      : undefined;
  if (sendTarget) {
    console.info("[probe-utils] writeStream using send/close", {
      stream: describeStream(stream),
    });
    sendTarget.send(data);
    if (shouldEnd) {
      if (typeof sendTarget.closeWrite === "function") {
        await sendTarget.closeWrite();
      } else if (typeof sendTarget.close === "function") {
        await sendTarget.close();
      }
    }
    return;
  }

  throw new Error("stream is not writable (sink missing)");
}
