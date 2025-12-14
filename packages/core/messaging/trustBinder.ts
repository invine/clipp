import type { ProtocolMessenger } from "./protocolMessenger.js";
import type { TrustManager, TrustedDevice } from "../trust/trusted-devices.js";
import {
  toTrustRequestPayload,
  verifyTrustRequestSignature,
  type TrustMessage,
  type TrustRequestMessage,
} from "../protocols/clipTrust.js";

/**
 * Wires the trust protocol to the trust manager.
 *
 * Designed to be bound to a concrete messenger multiple times (e.g. when the
 * underlying transport is recreated) without registering duplicate trust event
 * handlers.
 */
export function createTrustProtocolBinder(options: { trust: TrustManager; now?: () => number }): {
  bind(messaging: ProtocolMessenger<TrustMessage>): void;
} {
  const { trust } = options;
  const clock = options.now ?? Date.now;
  let current: ProtocolMessenger<TrustMessage> | null = null;

  const inboundRequests = new Map<string, TrustRequestMessage>();
  const inboundRequestTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const INBOUND_REQUEST_TTL_MS = 11 * 60 * 1000;
  let localIdentityPromise: ReturnType<TrustManager["getLocalIdentity"]> | null = null;

  async function getLocalIdentity() {
    if (!localIdentityPromise) {
      localIdentityPromise = trust.getLocalIdentity();
    }
    return await localIdentityPromise;
  }

  // TODO: why it's choosing first multiaddr?
  function targetFor(device: TrustedDevice): string {
    return device.multiaddrs?.[0] || device.multiaddr || device.deviceId;
  }

  function rememberInboundRequest(deviceId: string, req: TrustRequestMessage): void {
    inboundRequests.set(deviceId, req);
    const existing = inboundRequestTimers.get(deviceId);
    if (existing) clearTimeout(existing);
    inboundRequestTimers.set(
      deviceId,
      setTimeout(() => {
        inboundRequestTimers.delete(deviceId);
        inboundRequests.delete(deviceId);
      }, INBOUND_REQUEST_TTL_MS)
    );
  }

  function forgetInboundRequest(deviceId: string): void {
    const timer = inboundRequestTimers.get(deviceId);
    if (timer) clearTimeout(timer);
    inboundRequestTimers.delete(deviceId);
    inboundRequests.delete(deviceId);
  }

  async function sendAck(device: TrustedDevice, accepted: boolean): Promise<void> {
    const messaging = current;
    if (!messaging) return;
    const request = inboundRequests.get(device.deviceId);
    if (!request) return;
    const local = await getLocalIdentity();
    await messaging
      .send(targetFor(device), {
        type: "trust-ack",
        from: local.deviceId,
        to: device.deviceId,
        payload: { accepted, request, responder: toTrustRequestPayload(local) },
        sentAt: clock(),
      })
      .catch(() => { });
    forgetInboundRequest(device.deviceId);
  }

  // TODO: why do we map sendAck to trust events and at the same time add them to message on message
  trust.on("approved", (d) => void sendAck(d, true));
  trust.on("rejected", (d) => void sendAck(d, false));

  return {
    bind(messaging: ProtocolMessenger<TrustMessage>) {
      current = messaging;
      messaging.onMessage((msg) => {
        void (async () => {
          // TODO: Why this is not part of the protocol package? message should have a method valid(). It's not a binder's responsibility to know what's the correct TrustRequestMessage
          if (msg.type === "trust-request") {
            const local = await getLocalIdentity();
            if (msg.to !== local.deviceId) return;
            if (!msg.payload || typeof msg.payload !== "object") return;
            const payload = msg.payload as any;
            if (typeof payload.deviceId !== "string") return;
            if (payload.deviceId !== msg.from) return;
            if (!(await verifyTrustRequestSignature(msg))) return;
            rememberInboundRequest(payload.deviceId, msg);
            // TODO: do we even need to handle requests from devices which are already trusted?
            if (await trust.isTrusted(payload.deviceId)) {
              // TODO: payload should contain signature
              await sendAck(payload as TrustedDevice, true);
              return;
            }
            await trust.handleTrustRequest(payload as TrustedDevice);
            return;
          }

          if (msg.type === "trust-ack") {
            const local = await getLocalIdentity();
            if (msg.to !== local.deviceId) return;
            const payload = msg.payload as any;
            const accepted = payload?.accepted === true;
            const request = payload?.request as TrustRequestMessage | undefined;
            const responder = payload?.responder as TrustedDevice | undefined;
            if (!accepted) return;
            if (!request || request.type !== "trust-request") return;
            if (request.from !== local.deviceId) return;
            if (request.to !== msg.from) return;
            // TODO: validation of message should be done by protocol package
            if (!(await verifyTrustRequestSignature(request))) return;
            if (!responder || typeof responder.deviceId !== "string") return;
            if (responder.deviceId !== msg.from) return;
            await trust.add(responder);
            return;
          }
        })();
      });
    },
  };
}
