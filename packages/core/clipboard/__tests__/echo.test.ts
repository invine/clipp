import { createPollingClipboardService } from "../service";
import type { Clip } from "../../models/Clip";
import { jest } from "@jest/globals";

let clipboard = "";
const readMock = jest.fn(async () => clipboard);
const writeMock = jest.fn(async (text: string) => {
  void text;
});

describe("Echo prevention", () => {
  beforeEach(() => {
    clipboard = "";
    readMock.mockClear();
    writeMock.mockReset();
    writeMock.mockImplementation(async (text: string) => {
      void text;
    });
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("ignores echoed remote clip", async () => {
    const service = createPollingClipboardService({
      pollIntervalMs: 1000,
      getSenderId: () => "me",
      readText: readMock,
      writeText: writeMock,
    });
    let localClip: Clip | null = null;
    service.onLocalClip((c) => {
      localClip = c;
    });
    service.start();
    clipboard = "X";
    jest.advanceTimersByTime(1000);
    await jest.runOnlyPendingTimersAsync();
    expect(localClip).not.toBeNull();
    writeMock.mockClear();
    await service.writeRemoteClip(localClip!);
    expect(writeMock).not.toHaveBeenCalled();
  });

  test("does not re-emit remote writes as local clipboard changes", async () => {
    clipboard = "old";
    writeMock.mockImplementation(async (text: string) => {
      clipboard = text;
    });
    const service = createPollingClipboardService({
      pollIntervalMs: 1000,
      getSenderId: () => "me",
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    service.onLocalClip((c) => {
      events.push(c);
    });

    service.start();
    await jest.runOnlyPendingTimersAsync();
    events.length = 0;

    await service.writeRemoteClip({
      id: "remote-1",
      type: "text",
      content: "from android",
      timestamp: 1,
      senderId: "android",
    });

    jest.advanceTimersByTime(1000);
    await jest.runOnlyPendingTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });
});
