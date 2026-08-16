import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { toU8 } from "./bytes.js";
import { closeMessageStream, guardMessageStream, writeMessageStream } from "./messageStream.js";
import { decodeSignedPeerRecordBytes } from "./peerRecords.js";
import { CLIPP_RENDEZVOUS_PROTOCOL } from "./rendezvousProtocol.js";

export type RendezvousRecord = { peer: string; signedPeerRecord: Uint8Array };
export type RendezvousOptions = {
  timeoutMs?: number;
  dialOptions?: any;
  log?: (...args: any[]) => void;
};

const DEFAULT_RENDEZVOUS_TIMEOUT_MS = 8_000;

function asMultiaddr(value: string | Multiaddr) {
  return typeof value === "string" ? multiaddr(value) : value;
}

function decodeChunk(chunk: any) {
  const buf = toU8(chunk);
  if (!buf?.length) return null;
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
}

async function writeJson(stream: any, obj: any) {
  const data = new TextEncoder().encode(JSON.stringify(obj));
  await writeMessageStream(stream, data);
}

function getStreamIterable(stream: any): AsyncIterable<any> | undefined {
  if (!stream) return undefined;
  if (typeof stream[Symbol.asyncIterator] === "function") return stream;
  if (stream.source && typeof stream.source[Symbol.asyncIterator] === "function") return stream.source;
  if (stream.stream && typeof stream.stream[Symbol.asyncIterator] === "function") return stream.stream;
  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("rendezvous_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readJsonResponse(stream: any, timeoutMs: number) {
  const iterable = getStreamIterable(stream);
  if (!iterable) throw new Error("rendezvous_no_iterator");
  const iterator = iterable[Symbol.asyncIterator]();
  const deadline = Date.now() + timeoutMs;
  let complete = false;
  try {
    while (!complete) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("rendezvous_timeout");
      const next = await withTimeout(iterator.next(), remaining);
      if (next.done) {
        complete = true;
        continue;
      }
      const msg = decodeChunk(next.value);
      if (msg) return msg;
    }
    return null;
  } finally {
    try {
      await iterator.return?.();
    } catch {
      // ignore iterator close failures
    }
  }
}

async function closeStream(stream: any) {
  try {
    await closeMessageStream(stream, { ignoreClosedDataChannel: true });
  } catch {
    // ignore
  }
}

export async function registerOnRendezvous(
  node: any,
  relay: string | Multiaddr,
  topic: string,
  signedPeerRecord: Uint8Array,
  logOrOptions: ((...args: any[]) => void) | RendezvousOptions = () => {}
): Promise<boolean> {
  const options: RendezvousOptions =
    typeof logOrOptions === "function" ? { log: logOrOptions } : logOrOptions;
  const log = options.log ?? (() => {});
  let stream: any;
  try {
    const relayMa = asMultiaddr(relay);
    stream = guardMessageStream(await node.dialProtocol(relayMa, CLIPP_RENDEZVOUS_PROTOCOL, options.dialOptions));
    await writeJson(stream, { action: "register", topic, signedPeerRecord: Array.from(signedPeerRecord) });
    const msg = await readJsonResponse(stream, options.timeoutMs ?? DEFAULT_RENDEZVOUS_TIMEOUT_MS);
    log("[rendezvous] register response", msg);
    return !!msg?.ok;
  } catch (err: any) {
    log("[rendezvous] register failed", err?.message || err);
  } finally {
    await closeStream(stream);
  }
  return false;
}

export async function lookupRendezvousPeer(
  node: any,
  relay: string | Multiaddr,
  topic: string,
  peerId: string,
  logOrOptions: ((...args: any[]) => void) | RendezvousOptions = () => {}
): Promise<RendezvousRecord[]> {
  const options: RendezvousOptions =
    typeof logOrOptions === "function" ? { log: logOrOptions } : logOrOptions;
  const log = options.log ?? (() => {});
  let stream: any;
  try {
    const relayMa = asMultiaddr(relay);
    stream = guardMessageStream(await node.dialProtocol(relayMa, CLIPP_RENDEZVOUS_PROTOCOL, options.dialOptions));
    await writeJson(stream, { action: "lookup", topic, peerId });
    const msg = await readJsonResponse(stream, options.timeoutMs ?? DEFAULT_RENDEZVOUS_TIMEOUT_MS);
    if (msg?.ok && msg.record?.peer === peerId && Array.isArray(msg.record.signedPeerRecord)) {
      const signedPeerRecord = decodeSignedPeerRecordBytes(msg.record.signedPeerRecord);
      if (signedPeerRecord) return [{ peer: peerId, signedPeerRecord }];
    }
  } catch (err: any) {
    log("[rendezvous] list failed", err?.message || err);
  } finally {
    await closeStream(stream);
  }
  return [];
}

export async function unregisterFromRendezvous(
  node: any,
  relay: string | Multiaddr,
  topic: string,
  logOrOptions: ((...args: any[]) => void) | RendezvousOptions = () => {}
): Promise<boolean> {
  const options: RendezvousOptions = typeof logOrOptions === "function" ? { log: logOrOptions } : logOrOptions;
  let stream: any;
  try {
    stream = guardMessageStream(await node.dialProtocol(asMultiaddr(relay), CLIPP_RENDEZVOUS_PROTOCOL, options.dialOptions));
    await writeJson(stream, { action: "unregister", topic });
    return !!(await readJsonResponse(stream, options.timeoutMs ?? DEFAULT_RENDEZVOUS_TIMEOUT_MS))?.ok;
  } catch {
    return false;
  } finally {
    await closeStream(stream);
  }
}
