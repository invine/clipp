import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import { toU8 } from "./bytes.js";
import {
  CLIP_TRUST_PROTOCOL,
  createSignedTrustRequestFromKey,
  type TrustAckMessage,
  type TrustRequestMessage,
} from "../protocols/clipTrust.js";

export type TrustRequestPayload = TrustRequestMessage["payload"];

// TODO: rework the API so it's asyncronous (we don't wait for Trust Ack after sending request)
export async function sendTrustRequest(
  node: any,
  target: string | Multiaddr,
  payload: TrustRequestPayload,
  opts: {
    allowLimited?: boolean;
    logger?: (...args: any[]) => void;
    privateKey?: any;
  } = {}
): Promise<TrustAckMessage | undefined> {
  const allowLimited = opts.allowLimited !== false;
  const log = opts.logger || (() => { });
  const targetMa = typeof target === "string" ? multiaddr(target) : target;
  const deviceId = node.peerId.toString();
  const to =
    typeof (targetMa as any).getPeerId === "function"
      ? (targetMa as any).getPeerId()
      : undefined;
  if (!to) throw new Error("missing_target_peer_id");

  const signingKey =
    opts.privateKey ?? node?.components?.privateKey ?? node?.privateKey;
  if (!signingKey || typeof signingKey.sign !== "function") {
    throw new Error("missing_private_key");
  }

  // TODO: why is it here and not in protocol?
  const message: TrustRequestMessage = await createSignedTrustRequestFromKey({
    from: deviceId,
    to,
    // TODO: why trust-request payload is defined by some other layer, but type, deviceid and sentAt are defined here?
    payload: payload as any,
    privateKey: signingKey,
    sentAt: Date.now(),
  });

  log("trust-request:send", { target: targetMa.toString() });

  const stream = await node.dialProtocol(targetMa, CLIP_TRUST_PROTOCOL, {
    runOnLimitedConnection: allowLimited,
  });
  const ok = stream.send(new TextEncoder().encode(JSON.stringify(message)));
  // TODO: I don't understand this part
  if (ok === false && typeof stream?.onDrain === "function") {
    await stream.onDrain();
  }

  // NOTE: The current app-level pairing flow sends trust-acks on a new outbound
  // stream, not on this request stream. This is kept for tooling/probes.
  // TODO: rework this part to be inside handler for clip-trust protocol
  for await (const chunk of stream as AsyncIterable<any>) {
    try {
      const raw = new TextDecoder().decode(toU8(chunk));
      const msg = JSON.parse(raw);
      if (msg?.type === "trust-ack") return msg as TrustAckMessage;
    } catch {
      // ignore malformed
    }
  }
  return undefined;
}
