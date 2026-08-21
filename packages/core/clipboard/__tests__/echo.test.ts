import { createPollingClipboardService } from "../service";
import { createClipCaptureCoordinator } from "../captureCoordinator";
import type { Clip } from "../../models/Clip";
import { jest } from "@jest/globals";

let clipboard = "";
const readMock = jest.fn(async () => clipboard);
const writeMock = jest.fn(async (text: string) => {
  void text;
});
const peerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

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
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
    });
    let localClip: Clip | null = null;
    service.onLocalClip((c) => {
      localClip = c;
    });
    service.start();
    await jest.runOnlyPendingTimersAsync();
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
      getSenderId: () => peerId,
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
      originPeerId: "android",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    });

    jest.advanceTimersByTime(1000);
    await jest.runOnlyPendingTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });

  test("suppresses a delayed exact read-back of a Remote Clip", async () => {
    clipboard = "old";
    const stored: Clip[] = [];
    const service = createPollingClipboardService({
      pollIntervalMs: 1_000,
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
      captureCoordinator: createClipCaptureCoordinator({
        history: {
          accept: async (clip) => {
            stored.push(clip);
            return { kind: "newly-stored", clip, liveHandled: true };
          },
        },
        originPeerId: () => peerId,
      }),
    });
    const events: Clip[] = [];
    service.onLocalClip((clip) => events.push(clip));
    service.start();
    await jest.runOnlyPendingTimersAsync();

    await service.writeRemoteClip({
      id: "remote-delayed",
      type: "text",
      content: "visible later",
      originPeerId: "android",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    });
    clipboard = "visible later";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();

    expect(events).toEqual([]);
    expect(stored).toEqual([]);

    clipboard = "old";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();

    expect(events.map((clip) => clip.content)).toEqual(["old"]);
    expect(stored.map((clip) => clip.content)).toEqual(["old"]);
  });

  test("clears the expected echo after an immediate exact read-back", async () => {
    clipboard = "old";
    writeMock.mockImplementation(async (text: string) => {
      clipboard = text;
    });
    const service = createPollingClipboardService({
      pollIntervalMs: 1_000,
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    service.onLocalClip((clip) => events.push(clip));
    service.start();
    await jest.runOnlyPendingTimersAsync();

    await service.writeRemoteClip({
      id: "remote-immediate",
      type: "text",
      content: "copied remotely",
      originPeerId: "android",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    });
    clipboard = "intervening value";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();
    clipboard = "copied remotely";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();

    expect(events.map((clip) => clip.content)).toEqual([
      "intervening value",
      "copied remotely",
    ]);
  });

  test("captures a delayed Remote Clip after its expected echo expires", async () => {
    clipboard = "old";
    const service = createPollingClipboardService({
      pollIntervalMs: 1_000,
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    service.onLocalClip((clip) => events.push(clip));
    service.start();
    await jest.runOnlyPendingTimersAsync();

    await service.writeRemoteClip({
      id: "remote-expired",
      type: "text",
      content: "too late",
      originPeerId: "android",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    });
    jest.advanceTimersByTime(10_001);
    clipboard = "too late";
    await jest.advanceTimersByTimeAsync(1_000);

    expect(events.map((clip) => clip.content)).toEqual(["too late"]);
  });

  test("cancels the expected echo when another clipboard value arrives first", async () => {
    clipboard = "old";
    const service = createPollingClipboardService({
      pollIntervalMs: 1_000,
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    service.onLocalClip((clip) => events.push(clip));
    service.start();
    await jest.runOnlyPendingTimersAsync();

    await service.writeRemoteClip({
      id: "remote-interrupted",
      type: "text",
      content: "expected remote value",
      originPeerId: "android",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    });
    clipboard = "user copied this";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();
    clipboard = "expected remote value";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();

    expect(events.map((clip) => clip.content)).toEqual([
      "user copied this",
      "expected remote value",
    ]);
  });

  test("retains only the most recently written Remote Clip as an expected echo", async () => {
    clipboard = "old";
    const service = createPollingClipboardService({
      pollIntervalMs: 1_000,
      getSenderId: () => peerId,
      readText: readMock,
      writeText: writeMock,
    });
    const events: Clip[] = [];
    service.onLocalClip((clip) => events.push(clip));
    service.start();
    await jest.runOnlyPendingTimersAsync();

    await service.writeRemoteClip({
      id: "remote-first",
      type: "text",
      content: "first remote value",
      originPeerId: "android",
      capturedAt: 1,
      shareExpiresAt: 86_400_001,
    });
    await service.writeRemoteClip({
      id: "remote-second",
      type: "text",
      content: "second remote value",
      originPeerId: "android",
      capturedAt: 2,
      shareExpiresAt: 86_400_002,
    });
    clipboard = "second remote value";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();

    expect(events).toEqual([]);

    clipboard = "first remote value";
    jest.advanceTimersByTime(1_000);
    await jest.runOnlyPendingTimersAsync();

    expect(events.map((clip) => clip.content)).toEqual(["first remote value"]);
  });
});
