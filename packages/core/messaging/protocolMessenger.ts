import type { MessagingTransport } from "./transport.js";
import * as log from "../logger.js";

export type ProtocolCodec<Msg> = {
  encode(msg: Msg): Uint8Array;
  decode(data: Uint8Array, from: string): Msg | null;
};

export interface ProtocolMessenger<Msg> {
  send(target: string, msg: Msg): Promise<void>;
  broadcast(msg: Msg): Promise<void>;
  onMessage(cb: (msg: Msg) => void): void;
}

export function createProtocolMessenger<Msg>(
  transport: MessagingTransport,
  protocol: string,
  codec: ProtocolCodec<Msg>
): ProtocolMessenger<Msg> {
  const handlers: Array<(msg: Msg) => void> = [];

  transport.onMessage(protocol, (from, data) => {
    const msg = codec.decode(data, from);
    if (!msg) {
      log.debug("Protocol message decode failed", {
        protocol,
        from,
        bytes: data?.length ?? 0,
      });
      return;
    }
    for (const h of handlers) h(msg);
  });

  return {
    async send(target: string, msg: Msg): Promise<void> {
      await transport.send(protocol, target, codec.encode(msg));
    },
    // TODO: this is not correct. messages should be broadcasted only to trusted devices, not to all connected peers
    async broadcast(msg: Msg): Promise<void> {
      const peers = transport.getConnectedPeers();
      await Promise.all(peers.map((p) => transport.send(protocol, p, codec.encode(msg))));
    },
    onMessage(cb: (msg: Msg) => void): void {
      handlers.push(cb);
    },
  };
}
