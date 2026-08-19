import { createLibp2pMessagingTransport } from "../../../packages/core/network/engine";
import { createPairedPeerConnectionManager } from "../../../packages/core/network/pairedConnections";
import { createKVSignedPeerRecordPersistence } from "../../../packages/core/network/peerRecords";
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
import * as log from "../../../packages/core/logger";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import {
  createRuntimeIdentityManager,
  RUNTIME_CAPABILITIES,
} from "../../../packages/core/runtime";
import {
  handleExtensionReachabilityRequest,
  isExtensionReachabilityRequest,
} from "./networkBridge";
import { relayExtensionStream, type ExtensionStreamResponse } from "./streamBridge";

let transport: ReturnType<typeof createLibp2pMessagingTransport> | null = null;
let pairedConnections: ReturnType<typeof createPairedPeerConnectionManager> | null = null;
const runtimeRegisteredProtocols = new Set<string>();
const runtimeRegisteredStreamProtocols = new Set<string>();
const storage = new ChromeStorageBackend();
const identityRepo = createKVIdentityRepository({ storage, key: IDENTITY_KEY });
const identitySvc = createRuntimeIdentityManager({
  repo: identityRepo,
  capabilities: RUNTIME_CAPABILITIES.chromeExtension,
});
const trustRepo = createKVTrustedDeviceRepository({ storage, key: TRUST_KEY });
let trust = createTrustManager({ trustRepo, identitySvc });
let started = false;

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
  }
  const identity = await identitySvc.get();
  const peerId = await deviceIdToPeerIdObject(identity.deviceId);
  const privateKey =
    identity?.privateKey && typeof identity.privateKey === "string"
      ? await privateKeyFromProtobuf(base64ToBytes(identity.privateKey))
      : undefined;
  runtimeRegisteredProtocols.clear();
  runtimeRegisteredStreamProtocols.clear();
  transport = createLibp2pMessagingTransport({
    peerId,
    privateKey,
    relayAddresses: relays,
    enableDCUtR: true,
    signedPeerRecordPersistence: createKVSignedPeerRecordPersistence({ storage }),
    isPeerKnown: (remotePeerId) => trust.isTrusted(remotePeerId),
  });
  pairedConnections = createPairedPeerConnectionManager({
    transport,
    getPairedPeers: () => trust.list(),
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
    started = false;
    throw err;
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
    if (msg.action === "runtimeSend" && msg.peerTarget && msg.protocol && Array.isArray(msg.data)) {
      await transport.send(msg.protocol, msg.peerTarget, Uint8Array.from(msg.data));
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "runtimeSendStream" && msg.peerTarget && msg.protocol && Array.isArray(msg.frames)) {
      const frames = async function *(): AsyncIterable<Uint8Array> {
        for (const frame of msg.frames) {
          if (!Array.isArray(frame)) throw new Error("invalid_stream_frame");
          yield Uint8Array.from(frame);
        }
      };
      await transport.sendStream?.(msg.protocol, msg.peerTarget, frames());
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
    if (isExtensionReachabilityRequest(msg)) {
      sendResponse(await handleExtensionReachabilityRequest(msg, transport));
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
    if (msg.action === "runtimeRegisterStreamProtocol" && typeof msg.protocol === "string") {
      if (runtimeRegisteredStreamProtocols.has(msg.protocol)) {
        sendResponse({ ok: true });
        return;
      }
      runtimeRegisteredStreamProtocols.add(msg.protocol);
      transport.onStream(msg.protocol, (from, chunks) => relayExtensionStream({
        protocol: msg.protocol,
        from,
        chunks,
        send: async (message) => await chrome.runtime.sendMessage({
          source: "offscreen",
          ...message,
        }) as ExtensionStreamResponse,
      }));
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
