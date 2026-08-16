import { createLibp2pMessagingTransport } from "../../../packages/core/network/engine";
import { createPairedPeerConnectionManager } from "../../../packages/core/network/pairedConnections";
import { createKVPeerRecordStore } from "../../../packages/core/network/peerRecords";
import {
  createKVIdentityRepository,
  createKVTrustedDeviceRepository,
  createTrustManager,
  IDENTITY_KEY,
  TRUST_KEY,
} from "../../../packages/core/trust";
import { ChromeStorageBackend } from "./chromeStorage";
import { deviceIdToPeerIdObject } from "../../../packages/core/network/peerId";
import { DEFAULT_CIRCUIT_RELAY_ADDRESSES } from "../../../packages/core/network/constants";
import { createTrustedClipMessenger, createTrustedHistoryMessenger } from "../../../packages/core/messaging";
import * as log from "../../../packages/core/logger";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import {
  createRuntimeIdentityManager,
  RUNTIME_CAPABILITIES,
} from "../../../packages/core/runtime";

let transport: ReturnType<typeof createLibp2pMessagingTransport> | null = null;
let pairedConnections: ReturnType<typeof createPairedPeerConnectionManager> | null = null;
let clipMessaging: any = null;
let historyMessaging: any = null;
const runtimeRegisteredProtocols = new Set<string>();
const storage = new ChromeStorageBackend();
const identityRepo = createKVIdentityRepository({ storage, key: IDENTITY_KEY });
const identitySvc = createRuntimeIdentityManager({
  repo: identityRepo,
  capabilities: RUNTIME_CAPABILITIES.chromeExtension,
});
const trustRepo = createKVTrustedDeviceRepository({ storage, key: TRUST_KEY });
let trust = createTrustManager({ trustRepo, identitySvc });
let started = false;
const OFFSCREEN_OPERATION_TIMEOUT_MS = 15_000;

function base64ToBytes(b64: string): Uint8Array {
  try {
    // eslint-disable-next-line no-undef
    if (typeof Buffer !== "undefined") {
      // eslint-disable-next-line no-undef
      return Uint8Array.from(Buffer.from(b64, "base64"));
    }
  } catch {
    // ignore
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function initMessaging(relays: string[] = DEFAULT_CIRCUIT_RELAY_ADDRESSES) {
  if (transport && started) {
    pairedConnections?.start();
    return;
  }
  if (transport && !started) {
    try {
      pairedConnections?.stop();
      await transport.stop();
    } catch {
      // ignore stale transport cleanup failures
    }
    transport = null;
    pairedConnections = null;
    clipMessaging = null;
    historyMessaging = null;
  }
  const identity = await identitySvc.get();
  const peerId = await deviceIdToPeerIdObject(identity.deviceId);
  const privateKey =
    identity?.privateKey && typeof identity.privateKey === "string"
      ? await privateKeyFromProtobuf(base64ToBytes(identity.privateKey))
      : undefined;
  runtimeRegisteredProtocols.clear();
  transport = createLibp2pMessagingTransport({
    peerId,
    privateKey,
    relayAddresses: relays,
    enableDCUtR: true,
    peerRecordStore: createKVPeerRecordStore({ storage }),
    isPeerKnown: (remotePeerId) => trust.isTrusted(remotePeerId),
  });
  pairedConnections = createPairedPeerConnectionManager({
    transport,
    getPairedPeers: () => trust.list(),
  });

  clipMessaging = createTrustedClipMessenger(transport, (id) => trust.isTrusted(id));
  historyMessaging = createTrustedHistoryMessenger(transport, (id) => trust.isTrusted(id));

  clipMessaging.onMessage((msg: any) => {
    chrome.runtime.sendMessage({ source: "offscreen", action: "incoming", msg }).catch(() => {});
  });
  historyMessaging.onMessage((msg: any) => {
    chrome.runtime.sendMessage({ source: "offscreen", action: "incoming", msg }).catch(() => {});
  });
  transport.onSelfPeerUpdate((multiaddrs: string[]) => {
    chrome.runtime
      .sendMessage({ source: "offscreen", action: "selfPeerUpdate", multiaddrs })
      .catch(() => {});
  });
  const emitPeers = () => {
    const peers = transport?.getConnectedPeers?.() ?? [];
    const peerConnections = transport?.getPeerConnectionInfo?.() ?? [];
    chrome.runtime
      .sendMessage({ source: "offscreen", action: "peers", peers, peerConnections })
      .catch(() => {});
  };
  transport.onPeerConnected(emitPeers);
  transport.onPeerDisconnected(emitPeers);

  try {
    await transport.start();
    started = true;
    pairedConnections.start();
    emitPeers();
    log.info("Offscreen messaging started");
  } catch (err) {
    pairedConnections?.stop();
    transport = null;
    pairedConnections = null;
    clipMessaging = null;
    historyMessaging = null;
    started = false;
    throw err;
  }
}

async function withOperationTimeout<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label}_timeout`));
    }, OFFSCREEN_OPERATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  (async () => {
    if (msg.action === "init") {
      await initMessaging(msg.relays);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "ping") {
      sendResponse({ ok: true });
      return;
    }
    if (!transport) {
      sendResponse({ ok: false, error: "not_initialized" });
      return;
    }
    if (msg.action === "broadcast" && msg.msg) {
      const m = msg.msg as any;
      if (m?.type === "clip") {
        await withOperationTimeout("clip_broadcast", () => clipMessaging.broadcast(m));
      } else if (m?.type === "history-sync") {
        await withOperationTimeout("history_broadcast", () => historyMessaging.broadcast(m));
      } else {
        throw new Error("unsupported_message_type");
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "runtimeSend" && msg.peerTarget && msg.protocol && Array.isArray(msg.data)) {
      await transport.send(msg.protocol, msg.peerTarget, Uint8Array.from(msg.data));
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "runtimeConnect" && msg.peerTarget) {
      await transport.connect(msg.peerTarget);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "runtimeDisconnect" && msg.peerId) {
      await transport.disconnect?.(msg.peerId);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "runtimeGetSignedPeerRecord") {
      sendResponse({ record: Array.from(await transport.getSignedPeerRecord!()) });
      return;
    }
    if (msg.action === "runtimeGetSignedPeerRecordFor" && msg.peerId) {
      const record = await transport.getSignedPeerRecordFor?.(msg.peerId);
      sendResponse({ ...(record ? { record: Array.from(record) } : {}) });
      return;
    }
    if (msg.action === "runtimeImportSignedPeerRecord" && msg.peerId && Array.isArray(msg.record)) {
      await transport.importSignedPeerRecord!(msg.peerId, Uint8Array.from(msg.record));
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "runtimeRefreshPeerRecord" && msg.peerId) {
      await transport.refreshPeerRecord?.(msg.peerId);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "runtimeRegisterProtocol" && typeof msg.protocol === "string") {
      if (runtimeRegisteredProtocols.has(msg.protocol)) {
        sendResponse({ ok: true });
        return;
      }
      runtimeRegisteredProtocols.add(msg.protocol);
      transport.onMessage(msg.protocol, (from, data) => {
        chrome.runtime
          .sendMessage({
            source: "offscreen",
            action: "runtimeProtocol",
            protocol: msg.protocol,
            from,
            data: Array.from(data),
          })
          .catch(() => {});
      });
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "getPeers") {
      const peers = transport.getConnectedPeers ? transport.getConnectedPeers() : [];
      const peerConnections = transport.getPeerConnectionInfo?.() ?? [];
      sendResponse({ peers, peerConnections });
      return;
    }
    if (msg.action === "getStatus") {
      const peers = transport.getConnectedPeers ? transport.getConnectedPeers() : [];
      const peerConnections = transport.getPeerConnectionInfo?.() ?? [];
      sendResponse({ peers, peerConnections, started });
      return;
    }
    if (msg.action === "connectPairedPeers") {
      await pairedConnections?.reconnectNow();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "unknown_action" });
  })().catch((err) => {
    const error = (err as any)?.message || "offscreen_error";
    sendResponse({ ok: false, error });
    try {
      log.error("Offscreen handler error", err);
    } catch {
      // Response delivery is more important than diagnostics here.
    }
  });
  return true;
});
