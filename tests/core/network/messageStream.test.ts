import {
  guardMessageStream,
  isClosedDataChannelSendError,
  writeMessageStream,
} from "../../../packages/core/network/messageStream";

describe("message stream helpers", () => {
  it("recognizes node-datachannel closed channel send errors", () => {
    expect(
      isClosedDataChannelSendError(
        new Error("libdatachannel error while sending data channel message: DataChannel is closed")
      )
    ).toBe(true);
  });

  it("turns queued closed-channel send failures into write rejections", async () => {
    const err = new Error(
      "libdatachannel error while sending data channel message: DataChannel is closed"
    );
    const stream: any = {
      abort: jest.fn(),
      send: jest.fn(() => false),
      onDrain: jest.fn(async () => {
        stream.processSendQueue();
      }),
      processSendQueue: jest.fn(() => {
        throw err;
      }),
    };

    guardMessageStream(stream);

    await expect(writeMessageStream(stream, new Uint8Array([1, 2, 3]))).rejects.toThrow(
      "DataChannel is closed"
    );
    expect(stream.abort).toHaveBeenCalledWith(err);
  });

  it("does not swallow unrelated queued send failures", async () => {
    const err = new Error("unexpected stream failure");
    const stream: any = {
      abort: jest.fn(),
      send: jest.fn(() => false),
      onDrain: jest.fn(async () => {
        stream.processSendQueue();
      }),
      processSendQueue: jest.fn(() => {
        throw err;
      }),
    };

    guardMessageStream(stream);

    await expect(writeMessageStream(stream, new Uint8Array([1]))).rejects.toThrow(
      "unexpected stream failure"
    );
    expect(stream.abort).not.toHaveBeenCalled();
  });
});
