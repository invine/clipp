import type { ProtocolMessenger } from "./protocolMessenger.js";

export type TrustPredicate = (peerId: string) => Promise<boolean>;

export function withTrustedPeers<Msg extends { from: string }>(
  messenger: ProtocolMessenger<Msg>,
  isTrusted: TrustPredicate
): ProtocolMessenger<Msg> {
  return {
    send: messenger.send,
    async broadcast(msg) {
      const peers = messenger.getPeers?.();
      if (!peers) {
        await messenger.broadcast(msg);
        return;
      }
      const trustedPeers = (
        await Promise.all(
          peers.map(async (peerId) => ((await isTrusted(peerId)) ? peerId : null))
        )
      ).filter((peerId): peerId is string => typeof peerId === "string");
      await Promise.all(trustedPeers.map((peerId) => messenger.send(peerId, msg)));
    },
    onMessage(cb) {
      messenger.onMessage((msg) => {
        void (async () => {
          if (await isTrusted(msg.from)) cb(msg);
        })();
      });
    },
    getPeers: messenger.getPeers,
  };
}
