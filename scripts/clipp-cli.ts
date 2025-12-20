#!/usr/bin/env node
import "../apps/electron/src/libp2pGlobals.js";

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { createLibp2pMessagingTransport } from "../packages/core/network/engine.js";
import {
  deviceIdToPeerId,
  deviceIdToPeerIdObject,
  peerIdFromPrivateKeyBase64,
} from "../packages/core/network/peerId.js";
import { createTrustMessenger, createTrustedClipMessenger } from "../packages/core/messaging/channels.js";
import { createTrustProtocolBinder } from "../packages/core/messaging/trustBinder.js";
import { createTrustManager, type TrustedDevice } from "../packages/core/trust/trustManager.js";
import { createIdentityManager } from "../packages/core/trust/identity.js";
import {
  createKVIdentityRepository,
  createKVTrustedDeviceRepository,
  IDENTITY_KEY,
  TRUST_KEY,
  type KVStorageBackend,
} from "../packages/core/trust/storage.js";
import { decodePairing } from "../packages/core/pairing/decode.js";
import { encodePairing } from "../packages/core/pairing/encode.js";
import { createSignedTrustRequest, type TrustMessage } from "../packages/core/protocols/clipTrust.js";
import type { ClipMessage } from "../packages/core/protocols/clip.js";

type Mode = "request" | "host";

type CliOptions = {
  mode?: Mode;
  qrText?: string;
  qrFile?: string;
  storePath?: string;
  relayAddresses: string[];
  help?: boolean;
};

class JsonKVStore implements KVStorageBackend {
  constructor(private readonly filePath: string) { }

  async get<T = any>(key: string): Promise<T | undefined> {
    const data = await this.readAll();
    return data[key] as T | undefined;
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    const data = await this.readAll();
    data[key] = value;
    await this.writeAll(data);
  }

  async remove(key: string): Promise<void> {
    const data = await this.readAll();
    delete data[key];
    await this.writeAll(data);
  }

  private async readAll(): Promise<Record<string, any>> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, any>;
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        console.error("[cli] Failed to read store file", err?.message || err);
      }
    }
    return {};
  }

  private async writeAll(data: Record<string, any>): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { relayAddresses: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--mode": {
        const value = argv[i + 1];
        if (value === "request" || value === "host") {
          opts.mode = value;
          i++;
        }
        break;
      }
      case "--request":
        opts.mode = "request";
        break;
      case "--host":
      case "--respond":
        opts.mode = "host";
        break;
      case "--qr":
        opts.qrText = argv[i + 1];
        i++;
        break;
      case "--qr-file":
        opts.qrFile = argv[i + 1];
        i++;
        break;
      case "--store":
        opts.storePath = argv[i + 1];
        i++;
        break;
      case "--relay": {
        const value = argv[i + 1];
        if (value) {
          opts.relayAddresses.push(...value.split(",").map((v) => v.trim()).filter(Boolean));
          i++;
        }
        break;
      }
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        break;
    }
  }
  return opts;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/clipp-cli.ts --mode host --relay <multiaddr> [--store <file>]",
    "  tsx scripts/clipp-cli.ts --mode request --qr <base64> [--store <file>] [--relay <multiaddr>]",
    "",
    "Examples:",
    "  tsx scripts/clipp-cli.ts --mode host --relay \"/ip4/141.147.116.147/tcp/47891/ws/p2p/<relayPeerId>\"",
    "  tsx scripts/clipp-cli.ts --mode request --qr \"<base64-from-electron>\"",
    "  tsx scripts/clipp-cli.ts --mode request --qr-file ./pairing.txt",
  ].join("\n");
}

function normalizePairingInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) {
    const idx = trimmed.indexOf(",");
    if (idx >= 0) return trimmed.slice(idx + 1).trim();
  }
  return trimmed.replace(/\s+/g, "");
}

async function readStdin(): Promise<string> {
  return await new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

function validMultiaddrs(addrs: string[]): Multiaddr[] {
  const out: Multiaddr[] = [];
  for (const addr of addrs) {
    try {
      out.push(multiaddr(addr));
    } catch (err: any) {
      console.error("[cli] Invalid multiaddr skipped", addr, err?.message || err);
    }
  }
  return out;
}

function printClip(msg: ClipMessage): void {
  const clip = msg.clip;
  const stamp = new Date(msg.sentAt || clip.timestamp || Date.now()).toISOString();
  console.log(`[clip] from=${msg.from} type=${clip.type} id=${clip.id} sentAt=${stamp}`);
  console.log(clip.content);
  console.log("");
}

function getPeerIdFromAddr(addr: string): string | null {
  try {
    const ma = multiaddr(addr) as any;
    const pid = typeof ma.getPeerId === "function" ? ma.getPeerId() : undefined;
    return pid || null;
  } catch {
    return null;
  }
}

function buildRelayDialAddr(relayAddr: string, peerId: string): string | null {
  const trimmed = (relayAddr || "").trim();
  if (!trimmed) return null;
  let base = trimmed;
  const circuitIdx = base.indexOf("/p2p-circuit");
  if (circuitIdx >= 0) {
    base = base.slice(0, circuitIdx) + "/p2p-circuit";
  } else {
    base = `${base}/p2p-circuit`;
  }
  if (!base.includes(`/p2p/${peerId}`)) {
    base = `${base}/p2p/${peerId}`;
  }
  try {
    multiaddr(base);
    return base;
  } catch {
    return null;
  }
}

function selectRelayDialAddrs(addrs: string[], peerId: string): string[] {
  const out = new Set<string>();
  for (const addr of addrs) {
    if (!addr.includes("/p2p-circuit")) continue;
    const dial = buildRelayDialAddr(addr, peerId);
    if (dial) out.add(dial);
  }
  return Array.from(out);
}

function mergeRelayDialAddrs(
  observed: string[],
  relayAddresses: string[],
  peerId: string,
  includeDerived: boolean
): string[] {
  const out = new Set<string>(observed);
  if (includeDerived) {
    for (const relay of relayAddresses) {
      const dial = buildRelayDialAddr(relay, peerId);
      if (dial) out.add(dial);
    }
  }
  return Array.from(out);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNoReservationError(err: any): boolean {
  const code = typeof err?.code === "string" ? err.code : "";
  const msg = typeof err?.message === "string" ? err.message : String(err || "");
  return code.includes("NO_RESERVATION") || msg.includes("NO_RESERVATION");
}

async function sendTrustRequestWithRetry(options: {
  messenger: ReturnType<typeof createTrustMessenger>;
  request: TrustMessage;
  targets: Multiaddr[];
  attempts?: number;
  delayMs?: number;
}): Promise<void> {
  const attempts = options.attempts ?? 6;
  const delayMs = options.delayMs ?? 2000;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryableSeen = false;
    for (const target of options.targets) {
      try {
        await options.messenger.send(target.toString(), options.request as any);
        return;
      } catch (err: any) {
        lastErr = err;
        const retryable = isNoReservationError(err);
        retryableSeen = retryableSeen || retryable;
        console.error("[cli] Failed to send trust request", {
          target: target.toString(),
          attempt,
          attempts,
          error: err?.message || err,
        });
      }
    }
    if (!retryableSeen || attempt >= attempts) break;
    console.error("[cli] Relay reservation missing; retrying...");
    await delay(delayMs);
  }
  throw lastErr || new Error("dial_failed");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }

  const mode: Mode | undefined =
    opts.mode || (opts.qrText || opts.qrFile ? "request" : "host");
  if (mode !== "request" && mode !== "host") {
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  const isHost = mode === "host";

  const storePath = path.resolve(
    process.cwd(),
    opts.storePath || ".clipp-cli-store.json"
  );
  const storage = new JsonKVStore(storePath);
  const identityRepo = createKVIdentityRepository({
    storage,
    key: IDENTITY_KEY,
  });
  const trustRepo = createKVTrustedDeviceRepository({
    storage,
    key: TRUST_KEY,
  });
  const identitySvc = createIdentityManager({ repo: identityRepo });
  const trust = createTrustManager({ trustRepo, identitySvc });
  const trustBinder = createTrustProtocolBinder({ trust });

  const localIdentity = await identitySvc.get();
  const localDeviceId = localIdentity.deviceId;
  const peerId =
    localIdentity.privateKey && typeof localIdentity.privateKey === "string"
      ? await peerIdFromPrivateKeyBase64(localIdentity.privateKey)
      : await deviceIdToPeerIdObject(localIdentity.deviceId);
  const privateKey =
    localIdentity.privateKey && typeof localIdentity.privateKey === "string"
      ? privateKeyFromProtobuf(Buffer.from(localIdentity.privateKey, "base64"))
      : undefined;

  const relayAddresses = opts.relayAddresses;
  if (isHost && relayAddresses.length === 0) {
    console.error("[cli] Host mode requires at least one --relay address.");
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  const relayPeerIds = new Set(
    relayAddresses.map((addr) => getPeerIdFromAddr(addr)).filter(Boolean) as string[]
  );
  let relayReady = false;
  let currentSelfAddrs: string[] = Array.isArray(localIdentity.multiaddrs)
    ? localIdentity.multiaddrs
    : [];
  let lastQrKey = "";
  let lastQrEmpty = false;
  const transport = createLibp2pMessagingTransport({
    peerId,
    privateKey,
    relayAddresses,
  });
  const clipMessaging = createTrustedClipMessenger(transport, (id) => trust.isTrusted(id));
  const trustMessaging = createTrustMessenger(transport);
  trustBinder.bind(trustMessaging);

  const applySelfAddrUpdate = (source: string) => {
    const hasCircuitAddr = currentSelfAddrs.some((addr) => addr.includes("/p2p-circuit"));
    const nextRelayReady = hasCircuitAddr;
    if (nextRelayReady !== relayReady) {
      relayReady = nextRelayReady;
      if (relayReady) {
        console.error("[cli] Relay reservation ready");
      } else if (isHost) {
        console.error("[cli] Relay reservation unavailable; waiting...");
      }
    }
    const merged = mergeRelayDialAddrs(
      currentSelfAddrs,
      relayAddresses,
      localDeviceId,
      relayReady
    );
    void identitySvc.updateMultiaddrs(merged).catch((err) => {
      console.error("[cli] Failed to persist multiaddrs", err?.message || err);
    });
    if (isHost) {
      if (relayAddresses.length > 0 && !relayReady) {
        if (!lastQrEmpty) {
          console.error("[cli] Waiting for relay reservation to generate QR...");
          lastQrEmpty = true;
        }
        return;
      }
      const pairingAddrs = selectRelayDialAddrs(merged, localDeviceId);
      if (pairingAddrs.length === 0) {
        if (!lastQrEmpty) {
          console.error("[cli] Waiting for relay address to generate QR...");
          lastQrEmpty = true;
        }
        return;
      }
      lastQrEmpty = false;
      const key = pairingAddrs.slice().sort().join("\n");
      if (key === lastQrKey) return;
      lastQrKey = key;
      void (async () => {
        const id = await identitySvc.get();
        const qr = encodePairing({
          deviceId: id.deviceId,
          deviceName: id.deviceName,
          multiaddrs: pairingAddrs,
          publicKey: id.publicKey,
        });
        console.error("[cli] Pairing payload (base64):");
        console.log(qr);
        console.error("[cli] Pairing payload updated from", source);
        console.error("[cli] Waiting for trust request...");
      })();
    }
  };

  transport.onSelfPeerUpdate((multiaddrs) => {
    currentSelfAddrs = multiaddrs;
    applySelfAddrUpdate("self-update");
  });
  transport.onPeerConnected((peer) => {
    console.error("[cli] Peer connected", peer);
  });
  transport.onPeerDisconnected((peer) => {
    console.error("[cli] Peer disconnected", peer);
  });

  trust.on("request", (d: TrustedDevice) => {
    console.error("[cli] Trust request from", d.deviceId);
  });
  trust.on("approved", (d: TrustedDevice) => {
    if (d.deviceId === localDeviceId) return;
    console.error("[cli] Trust approved", d.deviceId);
  });
  trust.on("rejected", (d: TrustedDevice) => {
    if (d.deviceId === localDeviceId) return;
    console.error("[cli] Trust rejected", d.deviceId);
  });

  clipMessaging.onMessage((msg) => {
    printClip(msg);
  });

  trustMessaging.onMessage((msg: TrustMessage) => {
    if (msg.type !== "trust-ack") return;
    const payload: any = msg.payload || {};
    if (payload?.accepted !== true) return;
    const responder = payload?.responder;
    if (!responder || typeof responder.deviceId !== "string") return;
    if (responder.deviceId === localDeviceId) return;
    void trustRepo.upsert({ ...responder, lastSeen: Date.now() });
  });

  try {
    await transport.start();
  } catch (err: any) {
    console.error("[cli] Failed to start transport", err?.message || err);
    process.exitCode = 1;
    return;
  }
  const stopTransport = async () => {
    try {
      await transport.stop();
    } catch {
      // ignore stop failures
    }
  };

  if (mode === "host") {
    if (relayPeerIds.size === 0) {
      console.error("[cli] Relay peer id missing from --relay address; reservation tracking may be incomplete.");
    } else {
      console.error("[cli] Waiting for relay reservation...");
    }
    applySelfAddrUpdate("startup");
    trust.on("request", (d: TrustedDevice) => {
      void trust.sendTrustAck(d, true);
    });
  }

  if (mode === "request") {
    let raw = opts.qrText || "";
    if (!raw && opts.qrFile) {
      try {
        raw = await fs.readFile(opts.qrFile, "utf8");
      } catch (err: any) {
        console.error("[cli] Failed to read qr file", err?.message || err);
        process.exitCode = 1;
        await stopTransport();
        return;
      }
    }
    if (!raw && !process.stdin.isTTY) {
      raw = await readStdin();
    }
    const normalized = normalizePairingInput(raw);
    const pairing = decodePairing(normalized);
    if (!pairing) {
      console.error("[cli] Invalid pairing payload");
      process.exitCode = 1;
      await stopTransport();
      return;
    }

    const targetPeerId = await deviceIdToPeerId(pairing.deviceId);
    const candidateAddrs =
      pairing.multiaddrs && pairing.multiaddrs.length
        ? pairing.multiaddrs
        : (pairing as any).multiaddr
          ? [(pairing as any).multiaddr]
          : [];
    const targets = validMultiaddrs(candidateAddrs);
    if (!targets.length) {
      console.error("[cli] No valid target multiaddrs found");
      process.exitCode = 1;
      await stopTransport();
      return;
    }

    const identityForRequest = await identitySvc.get();
    const request = await createSignedTrustRequest(identityForRequest, targetPeerId);
    try {
      await sendTrustRequestWithRetry({
        messenger: trustMessaging,
        request,
        targets,
      });
      console.log("[cli] Trust request sent successfully");
    } catch (err: any) {
      if (isNoReservationError(err)) {
        console.error("[cli] Relay has no reservation for the target. Re-open QR on the other device and try again.");
      } else {
        console.error("[cli] Unable to send trust request to any target", err?.message || err);
      }
      process.exitCode = 1;
      await stopTransport();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        let done = false;
        trustMessaging.onMessage((msg: TrustMessage) => {
          if (done) return;
          if (msg.type !== "trust-ack") return;
          const payload: any = msg.payload || {};
          if (payload?.accepted !== true) {
            done = true;
            reject(new Error("rejected"));
            return;
          }
          const responder = payload?.responder;
          const ackDevice = responder || payload?.request?.payload;
          const deviceId = ackDevice?.deviceId;
          if (typeof deviceId === "string" && deviceId !== pairing.deviceId) return;
          if (deviceId && deviceId !== localDeviceId) {
            void trustRepo.upsert({ ...ackDevice, lastSeen: Date.now() });
          } else if (!deviceId) {
            return;
          }
          done = true;
          resolve();
        });
      });
    } catch (err: any) {
      console.error("[cli] Trust request rejected", err?.message || err);
      process.exitCode = 1;
      await stopTransport();
      return;
    }
    console.error("[cli] Trust request accepted; listening for clips...");
  }

  const shutdown = async () => {
    await transport.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await new Promise(() => { });
}

void main();
