import { createClipboardService } from "../service";
import type { Clip } from "../../models/Clip";
import { jest } from "@jest/globals";

let clipboard = "init";
export const readMock = jest.fn(async () => clipboard);
export const writeMock = jest.fn(async (_: string) => {});

jest.mock("../platform/chrome", () => ({
  readText: () => readMock(),
  writeText: (t: string) => writeMock(t),
}));

describe("ClipboardService watcher", () => {
  beforeEach(() => {
    clipboard = "init";
    readMock.mockClear();
    writeMock.mockClear();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("W-1 emits local clip on change", async () => {
    const service = createClipboardService("chrome", { pollIntervalMs: 1000 });
    const events: Clip[] = [];
    service.onLocalClip((c) => events.push(c));
    service.start();
    await jest.runOnlyPendingTimersAsync();
    events.length = 0; // ignore first read

    clipboard = "hello";
    jest.advanceTimersByTime(3000);
    await jest.runOnlyPendingTimersAsync();

    expect(events).toHaveLength(1);
    expect(events[0].content).toBe("hello");
  });

  test("W-2 auto-sync toggle", async () => {
    const sendClipMock = jest.fn(async () => {});
    const service = createClipboardService("chrome", {
      pollIntervalMs: 1000,
      sendClip: sendClipMock,
    });

    service.setAutoSync(false);
    service.start();
    await jest.runOnlyPendingTimersAsync();
    sendClipMock.mockClear();

    clipboard = "foo";
    jest.advanceTimersByTime(2000);
    await jest.runOnlyPendingTimersAsync();
    expect(sendClipMock).not.toHaveBeenCalled();

    service.setAutoSync(true);
    clipboard = "bar";
    jest.advanceTimersByTime(2000);
    await jest.runOnlyPendingTimersAsync();
    expect(sendClipMock).toHaveBeenCalledTimes(1);
    const called = (sendClipMock.mock.calls[0] as any)[0] as Clip;
    expect(called.content).toBe("bar");
  });

  test("W-3 ignores duplicate value", async () => {
    const service = createClipboardService("chrome", { pollIntervalMs: 1000 });
    const events: Clip[] = [];
    clipboard = "same";
    service.onLocalClip((c) => events.push(c));
    service.start();
    await jest.runOnlyPendingTimersAsync();

    jest.advanceTimersByTime(10000);
    await jest.runOnlyPendingTimersAsync();
    expect(events).toHaveLength(1);
  });

  test("W-4 deduplicates remote clips", async () => {
    const service = createClipboardService("chrome", { pollIntervalMs: 1000 });
    const clip: Clip = {
      id: "123",
      type: "text",
      content: "hi",
      timestamp: Date.now(),
      senderId: "remote",
    };
    await service.writeRemoteClip(clip);
    await service.writeRemoteClip(clip);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  test("W-5 stop halts polling", async () => {
    const service = createClipboardService("chrome", { pollIntervalMs: 1000 });
    service.start();
    await jest.runOnlyPendingTimersAsync();
    readMock.mockClear();
    service.stop();
    jest.advanceTimersByTime(5000);
    await jest.runOnlyPendingTimersAsync();
    expect(readMock).not.toHaveBeenCalled();
  });
});
