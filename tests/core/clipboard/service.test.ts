import { createPollingClipboardService } from "../../../packages/core/clipboard/service";
import { Clip } from "../../../packages/core/models/Clip";

let readValue = "";
const readMock = jest.fn(async () => readValue);
const writeMock = jest.fn(async (_text: string) => {});

describe("ClipboardService", () => {
  afterEach(() => {
    readMock.mockClear();
    writeMock.mockClear();
  });

  it("detects clipboard changes and emits local clip", async () => {
    jest.useFakeTimers();
    const service = createPollingClipboardService({
      pollIntervalMs: 50,
      getSenderId: () => "me",
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    service.onLocalClip((c) => events.push(c));
    readValue = "first";
    service.start();
    await jest.runOnlyPendingTimersAsync();
    expect(events.length).toBe(1);
    expect(events[0].content).toBe("first");
    expect(events[0].senderId).toBe("me");
    readValue = "second";
    jest.advanceTimersByTime(60);
    await jest.runOnlyPendingTimersAsync();
    expect(events.length).toBe(2);
    expect(events[1].content).toBe("second");
    jest.useRealTimers();
  });

  it("writes remote clip to clipboard", async () => {
    const service = createPollingClipboardService({
      pollIntervalMs: 50,
      getSenderId: () => "me",
      readText: readMock,
      writeText: writeMock,
    });
    const clip: Clip = {
      id: "1",
      type: "text",
      content: "hi",
      timestamp: Date.now(),
      senderId: "remote",
    };
    await service.writeRemoteClip(clip);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
