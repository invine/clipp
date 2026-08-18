import { createManualClipboardService, createPollingClipboardService } from "../../../packages/core/clipboard/service";
import { createClipCaptureCoordinator, type ClipHistoryWriter } from "../../../packages/core/clipboard/captureCoordinator";
import { Clip } from "../../../packages/core/models/Clip";

let readValue = "";
const readMock = jest.fn(async () => readValue);
const writeMock = jest.fn(async (_text: string) => {});
const peerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

describe("ClipboardService", () => {
  afterEach(() => {
    readMock.mockClear();
    writeMock.mockClear();
  });

  it("detects clipboard changes and emits local clip", async () => {
    jest.useFakeTimers();
    const service = createPollingClipboardService({
      pollIntervalMs: 50,
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    service.onLocalClip((c) => events.push(c));
    readValue = "";
    service.start();
    await jest.runOnlyPendingTimersAsync();
    expect(events.length).toBe(0);
    readValue = "first";
    jest.advanceTimersByTime(60);
    await jest.runOnlyPendingTimersAsync();
    expect(events.length).toBe(1);
    expect(events[0].content).toBe("first");
    expect(events[0].originPeerId).toBe(peerId);
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
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
    });
    const clip: Clip = {
      id: "1",
      type: "text",
      content: "hi",
      originPeerId: "remote",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
      timestamp: Date.now(),
      senderId: "remote",
    };
    await service.writeRemoteClip(clip);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("sends a recovered pending capture through local handlers", async () => {
    jest.useFakeTimers();
    const history: ClipHistoryWriter = {
      accept: jest
        .fn()
        .mockRejectedValueOnce(new Error("storage unavailable"))
        .mockImplementation(async (clip: Clip) => ({ kind: "newly-stored", clip, liveHandled: true })),
    };
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: () => peerId,
      makeId: () => "00000000-0000-4000-8000-000000000099",
    });
    const service = createManualClipboardService({ getSenderId: () => peerId, captureCoordinator: coordinator });
    const events: Clip[] = [];
    service.onLocalClip((clip) => events.push(clip));
    service.start();

    await service.processLocalText("recovered");
    await jest.advanceTimersByTimeAsync(1_000);

    expect(events).toEqual([expect.objectContaining({ content: "recovered" })]);
    service.stop();
    jest.useRealTimers();
  });

  it("preserves Share Now intent when a pending capture recovers", async () => {
    jest.useFakeTimers();
    const history: ClipHistoryWriter = {
      accept: jest
        .fn()
        .mockRejectedValueOnce(new Error("storage unavailable"))
        .mockImplementation(async (clip: Clip) => ({ kind: "newly-stored", clip, liveHandled: true })),
    };
    const coordinator = createClipCaptureCoordinator({
      history,
      originPeerId: () => peerId,
      makeId: () => "00000000-0000-4000-8000-000000000100",
    });
    const service = createManualClipboardService({ getSenderId: () => peerId, captureCoordinator: coordinator });
    const events: Array<{ clip: Clip; shareNow?: boolean }> = [];
    service.onLocalClip((clip, options) => events.push({ clip, shareNow: options?.shareNow }));
    service.start();

    await service.processLocalText("recover and share", { shareNow: true });
    await jest.advanceTimersByTimeAsync(1_000);

    expect(events).toEqual([expect.objectContaining({
      clip: expect.objectContaining({ content: "recover and share" }),
      shareNow: true,
    })]);
    service.stop();
    jest.useRealTimers();
  });
});
