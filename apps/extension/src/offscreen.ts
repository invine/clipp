import { createLibp2pMessagingTransport } from "../../../packages/core/network/engine";
import {
  activeMemberReconnectPeers,
  createPairedPeerConnectionManager,
} from "../../../packages/core/network/pairedConnections";
import { createKVSignedPeerRecordPersistence } from "../../../packages/core/network/peerRecords";
import {
  createKVIdentityRepository,
  IDENTITY_KEY,
} from "../../../packages/core/trust";
import { RuntimeMessageStorageBackend } from "./runtimeMessageStorage";
import {
  deriveExtensionIdentityKeyMaterial,
  generateExtensionIdentityKeyMaterial,
} from "./identityKeyMaterial";
import { deviceIdToPeerIdObject } from "../../../packages/core/network/peerId";
import {
  ManagedRelayController,
  type ManagedRelayConnection,
  type RelayConfiguration,
} from "../../../packages/core/network/managedRelays";
import { createExtensionManagedRelayController } from "./managedRelayOffscreen";
import {
  authorizedBackgroundControl,
  isManagedRelayControlAction,
  parseManagedRelayControlMessage,
} from "./managedRelayControl";
import { stopManagedOffscreenResources } from "./managedRelayCleanup";
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
import {
  relayExtensionStream,
  type ExtensionStreamResponse,
} from "./streamBridge";
import {
  handleExtensionClipboardRequest,
  isExtensionClipboardRequest,
} from "./clipboardBridge";
import { createOffscreenClipboardWriter } from "./offscreenClipboard";

let transport: ReturnType<typeof createLibp2pMessagingTransport> | null = null;
let pairedConnections: ReturnType<
  typeof createPairedPeerConnectionManager
> | null = null;
const runtimeRegisteredProtocols = new Set<string>();
const runtimeRegisteredStreamProtocols = new Set<string>();
const storage = new RuntimeMessageStorageBackend();
const identityRepo = createKVIdentityRepository({ storage, key: IDENTITY_KEY });
const identitySvc = createRuntimeIdentityManager({
  repo: identityRepo,
  capabilities: RUNTIME_CAPABILITIES.chromeExtension,
  generateKeyMaterial: generateExtensionIdentityKeyMaterial,
  deriveKeyMaterial: deriveExtensionIdentityKeyMaterial,
});
let started = false;
let managedController: ManagedRelayController | null = null;
const writeClipboardText = createOffscreenClipboardWriter();
const runtimeOutboundStreamControllers = new Map<string, AbortController>();

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

async function initMessaging(
  relays: string[] = [],
  managedConfigurations: RelayConfiguration[] = []
) {
  if (transport && started) {
    await managedController?.setConfigurations(managedConfigurations);
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
    signedPeerRecordPersistence: createKVSignedPeerRecordPersistence({
      storage,
    }),
    isPeerKnown: async (remotePeerId) =>
      (await identitySvc.membershipStatus(remotePeerId)) === "active",
    isPeerRevoked: async (remotePeerId) =>
      (await identitySvc.membershipStatus(remotePeerId)) === "revoked",
  });
  const managedTransport = transport as typeof transport & {
    managedRelayHost?: (
      onConnectionClosed?: (connection: ManagedRelayConnection) => void
    ) => Parameters<typeof createExtensionManagedRelayController>[0]["host"];
    setEligibleDialAddresses?: (
      filter: (addresses: string[]) => string[]
    ) => void;
  };
  managedTransport.setEligibleDialAddresses?.((addresses) =>
    managedController
      ? managedController.eligibleDialAddresses(addresses)
      : addresses.filter((address) => !address.includes("/p2p-circuit"))
  );
  pairedConnections = createPairedPeerConnectionManager({
    transport,
    getPairedPeers: activeMemberReconnectPeers(identitySvc),
  });

  transport.onSelfPeerUpdate((multiaddrs: string[]) => {
    chrome.runtime
      .sendMessage({
        source: "offscreen",
        action: "selfPeerUpdate",
        multiaddrs,
      })
      .catch(() => {});
  });
  const emitPeers = () => {
    const peers = transport?.getConnectedPeers?.() ?? [];
    const peerConnections = transport?.getPeerConnectionInfo?.() ?? [];
    chrome.runtime
      .sendMessage({
        source: "offscreen",
        action: "peers",
        peers,
        peerConnections,
      })
      .catch(() => {});
  };
  transport.onPeerConnected(emitPeers);
  transport.onPeerDisconnected(emitPeers);

  try {
    await transport.start();
    started = true;
    if (
      !managedTransport.managedRelayHost ||
      !managedTransport.setEligibleDialAddresses
    ) {
      if (managedConfigurations.length)
        throw new Error("managed_relay_host_unavailable");
    } else {
      const host = managedTransport.managedRelayHost((connection) => {
        for (const state of managedController?.states() ?? []) {
          if (state.peerId === connection.verifiedPeerId)
            void managedController?.connectionLost(state.key, connection);
        }
      });
      managedController = createExtensionManagedRelayController({
        host,
        onStateChange: (states) => {
          void chrome.runtime
            .sendMessage({
              source: "offscreen",
              action: "managedRelayStates",
              states,
            })
            .catch(() => undefined);
        },
      });
      void managedController
        .setConfigurations(managedConfigurations)
        .catch((error) => log.warn("Managed relay setup failed", error));
    }
    pairedConnections.start();
    emitPeers();
    log.info("Offscreen messaging started");
  } catch (err) {
    pairedConnections?.stop();
    await transport?.stop().catch(() => undefined);
    transport = null;
    pairedConnections = null;
    await managedController?.stop().catch(() => undefined);
    managedController = null;
    started = false;
    throw err;
  }
}

async function shutdownMessaging(): Promise<void> {
  runtimeOutboundStreamControllers.forEach((controller) => controller.abort());
  runtimeOutboundStreamControllers.clear();
  const controller = managedController;
  const connections = pairedConnections;
  const currentTransport = transport;
  try {
    await stopManagedOffscreenResources({
      controller: async () => {
        await controller?.stop();
      },
      reconnects: async () => {
        await connections?.stop();
      },
      transport: async () => {
        await currentTransport?.stop();
      },
    });
  } finally {
    managedController = null;
    transport = null;
    pairedConnections = null;
    started = false;
    runtimeRegisteredProtocols.clear();
    runtimeRegisteredStreamProtocols.clear();
  }
}

// Chrome's offscreen context omits runtime.getManifest, while the built MV3
// service worker has this stable loader URL.
const BACKGROUND_URL = chrome.runtime.getURL("service-worker-loader.js");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  const managedControl = isManagedRelayControlAction(msg.action)
    ? parseManagedRelayControlMessage(msg)
    : null;
  if (
    isManagedRelayControlAction(msg.action) &&
    (!authorizedBackgroundControl(sender, chrome.runtime.id, BACKGROUND_URL) ||
      !managedControl)
  ) {
    sendResponse({ ok: false, error: "managed_relay_control_unauthorized" });
    return false;
  }
  (async () => {
    if (managedControl?.action === "init") {
      await initMessaging([], managedControl.configurations);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "ping") {
      sendResponse({ ok: true });
      return;
    }
    if (managedControl?.action === "shutdown") {
      await shutdownMessaging();
      sendResponse({ ok: true });
      return;
    }
    if (managedControl?.action === "setManagedRelays") {
      if (!managedController) throw new Error("managed_relay_host_unavailable");
      await managedController.setConfigurations(managedControl.configurations);
      sendResponse({ ok: true });
      return;
    }
    if (managedControl?.action === "retryManagedRelay") {
      if (!managedController) throw new Error("managed_relay_host_unavailable");
      await managedController.retry(managedControl.key);
      sendResponse({ ok: true });
      return;
    }
    if (isExtensionClipboardRequest(msg)) {
      sendResponse(
        await handleExtensionClipboardRequest(msg, writeClipboardText)
      );
      return;
    }
    if (!transport) {
      sendResponse({ ok: false, error: "not_initialized" });
      return;
    }
    if (
      msg.action === "runtimeSend" &&
      msg.peerTarget &&
      msg.protocol &&
      Array.isArray(msg.data)
    ) {
      await transport.send(
        msg.protocol,
        msg.peerTarget,
        Uint8Array.from(msg.data)
      );
      sendResponse({ ok: true });
      return;
    }
    if (
      msg.action === "runtimeCancelSendStream" &&
      typeof msg.streamId === "string"
    ) {
      runtimeOutboundStreamControllers.get(msg.streamId)?.abort();
      sendResponse({ ok: true });
      return;
    }
    if (
      msg.action === "runtimeSendStream" &&
      typeof msg.streamId === "string" &&
      msg.peerTarget &&
      msg.protocol &&
      Array.isArray(msg.frames)
    ) {
      if (runtimeOutboundStreamControllers.has(msg.streamId)) {
        throw new Error("stream_already_started");
      }
      const controller = new AbortController();
      runtimeOutboundStreamControllers.set(msg.streamId, controller);
      const frames = async function* (): AsyncIterable<Uint8Array> {
        for (const frame of msg.frames) {
          if (!Array.isArray(frame)) throw new Error("invalid_stream_frame");
          yield Uint8Array.from(frame);
        }
      };
      try {
        await transport.sendStream?.(msg.protocol, msg.peerTarget, frames(), {
          signal: controller.signal,
          idleTimeoutMs:
            typeof msg.idleTimeoutMs === "number"
              ? msg.idleTimeoutMs
              : undefined,
        });
        sendResponse({ ok: true });
      } finally {
        runtimeOutboundStreamControllers.delete(msg.streamId);
      }
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
    if (
      msg.action === "runtimeRegisterProtocol" &&
      typeof msg.protocol === "string"
    ) {
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
    if (
      msg.action === "runtimeRegisterStreamProtocol" &&
      typeof msg.protocol === "string"
    ) {
      if (runtimeRegisteredStreamProtocols.has(msg.protocol)) {
        sendResponse({ ok: true });
        return;
      }
      runtimeRegisteredStreamProtocols.add(msg.protocol);
      transport.onStream(msg.protocol, (from, chunks) =>
        relayExtensionStream({
          protocol: msg.protocol,
          from,
          chunks,
          send: async (message) =>
            (await chrome.runtime.sendMessage({
              source: "offscreen",
              ...message,
            })) as ExtensionStreamResponse,
        })
      );
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === "getPeers") {
      const peers = transport.getConnectedPeers
        ? transport.getConnectedPeers()
        : [];
      const peerConnections = transport.getPeerConnectionInfo?.() ?? [];
      sendResponse({ peers, peerConnections });
      return;
    }
    if (msg.action === "getStatus") {
      const peers = transport.getConnectedPeers
        ? transport.getConnectedPeers()
        : [];
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
      log.error("Offscreen handler error", { action: msg.action, failure: err });
    } catch {
      // Response delivery is more important than diagnostics here.
    }
  });
  return true;
});
