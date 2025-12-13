import { createPollingClipboardService } from "../service";
import type { Clip } from "../../models/Clip";
import { jest } from "@jest/globals";

let clipboard = "init";
const readMock = jest.fn(async () => clipboard);
const writeMock = jest.fn(async (_: string) => {});

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
    const service = createPollingClipboardService({
      pollIntervalMs: 1000,
      getSenderId: () => "me",
      readText: readMock,
      writeText: writeMock,
    });
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

  test("W-3 ignores duplicate value", async () => {
    const service = createPollingClipboardService({
      pollIntervalMs: 1000,
      getSenderId: () => "me",
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    clipboard = "same";
    service.onLocalClip((c) => events.push(c));
    service.start();
    await jest.runOnlyPendingTimersAsync();

    jest.advanceTimersByTime(10000);
    await jest.runOnlyPendingTimersAsync();
    expect(events).toHaveLength(1);
  });

  test("W-5 stop halts polling", async () => {
    const service = createPollingClipboardService({
      pollIntervalMs: 1000,
      getSenderId: () => "me",
      readText: readMock,
      writeText: writeMock,
    });
    service.start();
    await jest.runOnlyPendingTimersAsync();
    readMock.mockClear();
    service.stop();
    jest.advanceTimersByTime(5000);
    await jest.runOnlyPendingTimersAsync();
    expect(readMock).not.toHaveBeenCalled();
  });
});
