import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { toU8 } from "./bytes.js";

export type RendezvousRecord = { peer: string; addrs: string[]; lastSeen?: number };

const TOPIC = "/rendezvous/1.0.0";

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
  if (typeof stream?.send !== "function") {
    throw new Error("rendezvous stream is not a libp2p MessageStream (missing send)");
  }
  const ok = stream.send(data);
  if (ok === false && typeof stream?.onDrain === "function") {
    await stream.onDrain();
  }
}

export async function registerOnRendezvous(
  node: any,
  relay: string | Multiaddr,
  topic: string,
  addrs: string[],
  log: (...args: any[]) => void = () => {}
): Promise<boolean> {
  try {
    const relayMa = asMultiaddr(relay);
    const stream = await node.dialProtocol(relayMa, TOPIC);
    await writeJson(stream, { action: "register", topic, addrs });
    for await (const chunk of stream as AsyncIterable<any>) {
      const msg = decodeChunk(chunk);
      if (!msg) continue;
      log("[rendezvous] register response", msg);
      try {
        await stream?.close?.();
      } catch {
        // ignore
      }
      return !!msg.ok;
    }
  } catch (err: any) {
    log("[rendezvous] register failed", err?.message || err);
  }
  return false;
}

export async function listRendezvousPeers(
  node: any,
  relay: string | Multiaddr,
  topic: string,
  log: (...args: any[]) => void = () => {}
): Promise<RendezvousRecord[]> {
  try {
    const relayMa = asMultiaddr(relay);
    const stream = await node.dialProtocol(relayMa, TOPIC);
    await writeJson(stream, { action: "list", topic });
    for await (const chunk of stream as AsyncIterable<any>) {
      const msg = decodeChunk(chunk);
      if (msg?.ok && Array.isArray(msg.peers)) {
        const peers = msg.peers
          .map((p: any) => ({
            peer: String(p?.peer || ""),
            addrs: Array.isArray(p?.addrs) ? p.addrs.filter((a: any) => typeof a === "string") : [],
            lastSeen: typeof p?.lastSeen === "number" ? p.lastSeen : undefined,
          }))
          .filter((p: any) => p.peer && Array.isArray(p.addrs));
        log("[rendezvous] list response", { topic, count: peers.length });
        try {
          await stream?.close?.();
        } catch {
          // ignore
        }
        return peers;
      }
    }
  } catch (err: any) {
    log("[rendezvous] list failed", err?.message || err);
  }
  return [];
}
