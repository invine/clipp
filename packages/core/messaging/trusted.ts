import type { ProtocolMessenger } from "./protocolMessenger.js";

export type TrustPredicate = (peerId: string) => Promise<boolean>;

export function withTrustedPeers<Msg extends { from: string }>(
  messenger: ProtocolMessenger<Msg>,
  isTrusted: TrustPredicate
): ProtocolMessenger<Msg> {
  return {
    send: messenger.send,
    broadcast: messenger.broadcast,
    onMessage(cb) {
      messenger.onMessage((msg) => {
        void (async () => {
          if (await isTrusted(msg.from)) cb(msg);
        })();
      });
    },
  };
}

