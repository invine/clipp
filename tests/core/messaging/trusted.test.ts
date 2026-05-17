import { withTrustedPeers, type TrustPredicate } from "../../../packages/core/messaging/trusted";
import type { ProtocolMessenger } from "../../../packages/core/messaging/protocolMessenger";

type TestMessage = {
  type: "test";
  from: string;
};

describe("withTrustedPeers", () => {
  it("filters outbound broadcasts to trusted peers", async () => {
    const send = jest.fn(async () => {});
    const messenger: ProtocolMessenger<TestMessage> = {
      send,
      broadcast: jest.fn(async () => {}),
      onMessage: jest.fn(),
      getPeers: () => ["trusted-peer", "untrusted-peer"],
    };
    const isTrusted: TrustPredicate = async (peerId) => peerId === "trusted-peer";

    const trusted = withTrustedPeers(messenger, isTrusted);
    const msg: TestMessage = { type: "test", from: "me" };
    await trusted.broadcast(msg);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("trusted-peer", msg);
    expect(messenger.broadcast).not.toHaveBeenCalled();
  });
});
