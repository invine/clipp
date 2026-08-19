import {
  createExtensionStreamReceiver,
  relayExtensionStream,
  sendBufferedExtensionStream,
} from "../../../apps/extension/src/streamBridge";

describe("Chrome extension stream bridge", () => {
  it("stops the offscreen producer when background stream processing fails", async () => {
    const receiver = createExtensionStreamReceiver();
    const consumed: number[] = [];
    receiver.onStream("/clipp/history/1.0.0", async (_from, chunks) => {
      for await (const chunk of chunks) {
        consumed.push(chunk[0]);
        throw new Error("invalid_history_framing");
      }
    });
    let produced = 0;
    const chunks = async function *(): AsyncIterable<Uint8Array> {
      produced += 1;
      yield Uint8Array.of(0x80);
      produced += 1;
      yield Uint8Array.of(0x01);
    };

    await expect(relayExtensionStream({
      protocol: "/clipp/history/1.0.0",
      from: "active-member",
      chunks: chunks(),
      streamId: "stream-1",
      send: (message) => receiver.handle(message),
    })).rejects.toThrow("invalid_history_framing");

    expect(consumed).toEqual([0x80]);
    expect(produced).toBe(1);
  });

  it("forwards outbound cancellation to the offscreen transport", async () => {
    const messages: Array<{ action: string; streamId?: string }> = [];
    let rejectSending!: (error: Error) => void;
    let markStreamStarted!: () => void;
    const streamStarted = new Promise<void>((resolve) => { markStreamStarted = resolve; });
    const send = jest.fn(async (message: { action: string; streamId?: string }) => {
      messages.push(message);
      if (message.action === "runtimeCancelSendStream") {
        rejectSending(new Error("stream_cancelled"));
        return { ok: true };
      }
      markStreamStarted();
      return await new Promise<{ ok: true }>((_resolve, reject) => {
        rejectSending = reject;
      });
    });
    const controller = new AbortController();
    const sending = sendBufferedExtensionStream({
      protocol: "/clipp/history/1.0.0",
      target: "active-member",
      frames: (async function *() { yield Uint8Array.of(1); })(),
      signal: controller.signal,
      streamId: "outbound-1",
      send,
    });
    await streamStarted;

    controller.abort();
    await expect(sending).rejects.toThrow("stream_cancelled");
    expect(messages.map((message) => message.action)).toEqual([
      "runtimeSendStream",
      "runtimeCancelSendStream",
    ]);
  });
});
