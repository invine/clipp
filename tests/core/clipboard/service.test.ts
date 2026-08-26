import { createManualClipboardService, createPollingClipboardService } from "../../../packages/core/clipboard/service";
import { createClipCaptureCoordinator, type ClipHistoryWriter } from "../../../packages/core/clipboard/captureCoordinator";
import { HistoryPolicyError } from "../../../packages/core/history/types";
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
    };
    await service.writeRemoteClip(clip);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("emits one new Local Clip when reusing history and absorbs the polling echo", async () => {
    jest.useFakeTimers();
    const clips: Clip[] = [];
    let nextId = 300;
    const coordinator = createClipCaptureCoordinator({
      history: {
        accept: async (clip) => {
          clips.push(clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
      originPeerId: () => peerId,
      now: () => 5_000,
      makeId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
    });
    const service = createPollingClipboardService({
      pollIntervalMs: 50,
      getSenderId: () => peerId,
      readText: readMock,
      writeText: async (text) => {
        writeMock(text);
        readValue = text;
      },
      captureCoordinator: coordinator,
    });
    const events: Clip[] = [];
    service.onLocalClip((clip) => events.push(clip));
    readValue = "initial baseline";
    service.start();
    await jest.runOnlyPendingTimersAsync();

    await expect(service.reuseLocalClip({ type: "text", content: "retained value" } as Clip))
      .resolves.toEqual(expect.objectContaining({
        status: "complete",
        clip: expect.objectContaining({ content: "retained value" }),
      }));
    jest.advanceTimersByTime(60);
    await jest.runOnlyPendingTimersAsync();

    expect(writeMock).toHaveBeenCalledWith("retained value");
    expect(clips).toHaveLength(1);
    expect(events).toEqual([expect.objectContaining({ content: "retained value" })]);
    service.stop();
    jest.useRealTimers();
  });

  it("creates a distinct Clip for every Share Now capture at the current baseline", async () => {
    const clips: Clip[] = [];
    let nextId = 400;
    const coordinator = createClipCaptureCoordinator({
      history: {
        accept: async (clip) => {
          clips.push(clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
      originPeerId: () => peerId,
      makeId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
    });
    const service = createManualClipboardService({ getSenderId: () => peerId, captureCoordinator: coordinator });
    await expect(service.processLocalText("captured before startup")).resolves.toBeNull();
    await expect(service.reuseLocalClip({ type: "text", content: "reused before startup" } as Clip))
      .rejects.toThrow("clipboard_service_inactive");
    service.start();

    await service.processLocalText("same clipboard", { shareNow: true });
    await service.processLocalText("same clipboard", { shareNow: true });

    expect(clips.map((clip) => clip.id)).toEqual([
      "00000000-0000-4000-8000-000000000400",
      "00000000-0000-4000-8000-000000000401",
    ]);
  });

  it("exposes a Share Now failure when no Clip can be created", async () => {
    const service = createManualClipboardService({
      getSenderId: () => peerId,
      captureCoordinator: createClipCaptureCoordinator({
        history: {
          accept: async () => { throw new HistoryPolicyError("clip_capacity"); },
        },
        originPeerId: () => peerId,
        makeId: () => "00000000-0000-4000-8000-000000000450",
      }),
    });
    service.start();

    await expect(service.processLocalText("cannot be retained", { shareNow: true }))
      .rejects.toThrow("clip_capture_failed");
  });

  it("reports partial success when the clipboard write succeeds but no Clip can be created", async () => {
    const service = createManualClipboardService({
      getSenderId: () => peerId,
      writeText: async () => {},
      captureCoordinator: createClipCaptureCoordinator({
        history: {
          accept: async () => { throw new HistoryPolicyError("clip_capacity"); },
        },
        originPeerId: () => peerId,
        makeId: () => "00000000-0000-4000-8000-000000000451",
      }),
    });
    service.start();

    await expect(service.reuseLocalClip({ type: "text", content: "cannot be retained" } as Clip))
      .resolves.toEqual({ status: "copied-without-clip" });
  });

  it("suppresses transformed manual read-back observations after explicit history reuse", async () => {
    const clips: Clip[] = [];
    let nextId = 600;
    const coordinator = createClipCaptureCoordinator({
      history: {
        accept: async (clip) => {
          clips.push(clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
      originPeerId: () => peerId,
      makeId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
    });
    const service = createManualClipboardService({
      getSenderId: () => peerId,
      writeText: async () => {},
      readText: async () => "platform-transformed value",
      captureCoordinator: coordinator,
    });
    service.start();

    await service.reuseLocalClip({ type: "text", content: "retained value" } as Clip);
    await service.processLocalText("platform-transformed value");

    expect(clips).toHaveLength(1);
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

  it("waits for an in-flight capture before completing shutdown", async () => {
    let markCaptureStarted!: () => void;
    let releaseCapture!: () => void;
    const captureStarted = new Promise<void>((resolve) => { markCaptureStarted = resolve; });
    const captureGate = new Promise<void>((resolve) => { releaseCapture = resolve; });
    const coordinator = createClipCaptureCoordinator({
      history: {
        accept: async (clip) => {
          markCaptureStarted();
          await captureGate;
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
      originPeerId: () => peerId,
      makeId: () => "00000000-0000-4000-8000-000000000700",
    });
    const service = createManualClipboardService({ getSenderId: () => peerId, captureCoordinator: coordinator });
    service.start();
    const capture = service.processLocalText("captured before shutdown");
    await captureStarted;

    let stopped = false;
    const stopping = service.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    releaseCapture();

    await expect(capture).resolves.toMatchObject({ content: "captured before shutdown" });
    await stopping;
    await expect(service.processLocalText("captured after shutdown")).resolves.toBeNull();
    await expect(service.reuseLocalClip({ type: "text", content: "reused after shutdown" } as Clip))
      .rejects.toThrow("clipboard_service_inactive");
  });
});
