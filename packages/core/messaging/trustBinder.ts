import type { ProtocolMessenger } from "./protocolMessenger.js";
import type {
  TrustManager,
  // TrustedDevice
} from "../trust/trustManager.js";
import * as log from "../logger.js";
import {
  // toTrustRequestPayload,
  // verifyTrustRequestSignature,
  type TrustMessage,
  // type TrustRequestMessage,
} from "../protocols/clipTrust.js";
// import { IdentityManager } from "../trust/identity.js";

/**
 * Wires the trust protocol to the trust manager.
 *
 * Designed to be bound to a concrete messenger multiple times (e.g. when the
 * underlying transport is recreated) without registering duplicate trust event
 * handlers.
 */
export function createTrustProtocolBinder(options: {
  trust: TrustManager;
  // now?: () => number
}): {
  bind(messaging: ProtocolMessenger<TrustMessage>): void;
} {
  const { trust } = options;
  // const clock = options.now ?? Date.now;
  let current: ProtocolMessenger<TrustMessage> | null = null;

  // this part is moved to trust manager
  // const inboundRequests = new Map<string, TrustRequestMessage>();
  // const inboundRequestTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // const INBOUND_REQUEST_TTL_MS = 11 * 60 * 1000;
  // let localIdentityPromise: ReturnType<IdentityManager["get"]> | null = null;
  //
  // async function getLocalIdentity() {
  //   if (!localIdentityPromise) {
  //     localIdentityPromise = identity.get();
  //   }
  //   return await localIdentityPromise;
  // }

  // TODO: why it's choosing first multiaddr?
  // This should not be part of trust binder. Network decides itself the address
  // function targetFor(device: TrustedDevice): string {
  //   return device.multiaddrs?.[0] || device.deviceId;
  // }

  // this part is moved to trust manager
  // function rememberInboundRequest(deviceId: string, req: TrustRequestMessage): void {
  //   inboundRequests.set(deviceId, req);
  //   const existing = inboundRequestTimers.get(deviceId);
  //   if (existing) clearTimeout(existing);
  //   inboundRequestTimers.set(
  //     deviceId,
  //     setTimeout(() => {
  //       inboundRequestTimers.delete(deviceId);
  //       inboundRequests.delete(deviceId);
  //     }, INBOUND_REQUEST_TTL_MS)
  //   );
  // }

  // function forgetInboundRequest(deviceId: string): void {
  //   const timer = inboundRequestTimers.get(deviceId);
  //   if (timer) clearTimeout(timer);
  //   inboundRequestTimers.delete(deviceId);
  //   inboundRequests.delete(deviceId);
  // }

  // async function sendAck(device: TrustedDevice, accepted: boolean): Promise<void> {
  //   const messaging = current;
  //   if (!messaging) return;
  //   const request = inboundRequests.get(device.deviceId);
  //   if (!request) return;
  //   const local = await getLocalIdentity();
  //   await messaging
  //     .send(targetFor(device), {
  //       type: "trust-ack",
  //       from: local.deviceId,
  //       to: device.deviceId,
  //       payload: { accepted, request, responder: toTrustRequestPayload(local) },
  //       sentAt: clock(),
  //     })
  //     .catch(() => { });
  //   forgetInboundRequest(device.deviceId);
  // }

  // TODO: why do we map sendAck to trust events and at the same time add them to message on message
  // trust.on("approved", (d) => void sendAck(d, true));
  // trust.on("rejected", (d) => void sendAck(d, false));

  return {
    bind(messaging: ProtocolMessenger<TrustMessage>) {
      current = messaging;
      trust.bindMessenger(messaging)
      messaging.onMessage((msg) => {
        if (msg) {
          log.debug("[trust] inbound message", {
            type: msg.type,
            from: msg.from,
            to: (msg as any).to,
          });
        }
        void (async () => {
          // TODO: Why this is not part of the protocol package? message should have a method valid(). It's not a binder's responsibility to know what's the correct TrustRequestMessage
          // TODO: Implement validation
          if (!msg) return;
          log.debug("[trust] handling message", {
            type: msg.type,
            from: msg.from,
            to: (msg as any).to,
          });
          // const local = await getLocalIdentity();
          // if (msg.to !== local.deviceId) return;
          // if (!msg.fromdepr - depr || typeof msg.fromdepr - depr !== "object") return;
          // const payload = msg.fromdepr - depr as any;
          // if (typeof payload.deviceId !== "string") return;
          // if (payload.deviceId !== msg.fromdepr - depr) return;
          // if (!(await verifyTrustRequestSignature(msg))) return;
          // rememberInboundRequest(payload.deviceId, msg);
          // // TODO: do we even need to handle requests from devices which are already trusted?
          // if (await trust.isTrusted(payload.deviceId)) {
          //   // TODO: payload should contain signature
          //   await sendAck(payload as TrustedDevice, true);
          //   return;
          // }
          await trust.handleTrustMessage(msg);
          return;

          // if (msg.type === "trust-ack") {
          // TODO: implement validation
          // if (!msg.valid()) return;
          // const local = await getLocalIdentity();
          // if (msg.to !== local.deviceId) return;
          // const payload = msg.payload as any;
          // const accepted = payload?.accepted === true;
          // const request = payload?.request as TrustRequestMessage | undefined;
          // const responder = payload?.responder as TrustedDevice | undefined;
          // if (!accepted) return;
          // if (!request || request.type !== "trust-request") return;
          // if (request.fromdepr - depr !== local.deviceId) return;
          // if (request.to !== msg.from) return;
          // // TODO: validation of message should be done by protocol package
          // if (!(await verifyTrustRequestSignature(request))) return;
          // if (!responder || typeof responder.deviceId !== "string") return;
          // if (responder.deviceId !== msg.from) return;
          // await trust.handleTrustAck(msg);
          // return;
          // }
        })();
      });
    },
  };
}
