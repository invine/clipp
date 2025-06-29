import { createClipboardService } from "../../../packages/core/clipboard/service";
import { Clip } from "../../../packages/core/models/Clip";

let changeCb: ((t: string) => void) | undefined;

jest.mock("../../../packages/core/clipboard/watcher", () => ({
  createWatcher: (_read: any, _ms: number) => ({
    start: () => {
      if (changeCb) changeCb(readValue);
    },
    stop: () => {},
    onChange: (cb: any) => {
      changeCb = cb;
    },
  }),
}));

let readValue = "";
const readMock = jest.fn(async () => readValue);
const writeMock = jest.fn(async (_text: string) => {});

jest.mock("../../../packages/core/clipboard/platform/chrome", () => ({
  readText: () => readMock(),
  writeText: (t: string) => writeMock(t),
}));

describe("ClipboardService", () => {
  afterEach(() => {
    readMock.mockClear();
    writeMock.mockClear();
  });

  it("detects clipboard changes and emits local clip", async () => {
    const sent: Clip[] = [];
    const service = createClipboardService("chrome", {
      pollIntervalMs: 50,
      sendClip: async (c) => {
        sent.push(c);
      },
    });
    const events: Clip[] = [];
    service.onLocalClip((c) => events.push(c));
    readValue = "first";
    service.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(events.length).toBe(1);
    expect(events[0].content).toBe("first");
    readValue = "second";
    if (changeCb) changeCb(readValue);
    await Promise.resolve();
    await Promise.resolve();
    expect(events.length).toBe(2);
    expect(events[1].content).toBe("second");
    expect(sent.length).toBe(2);
  });

  it("does not send when autoSync is disabled", async () => {
    const sent: Clip[] = [];
    const service = createClipboardService("chrome", {
      pollIntervalMs: 50,
      sendClip: async (c) => {
        sent.push(c);
      },
    });
    service.setAutoSync(false);
    service.start();
    readValue = "hello";
    if (changeCb) changeCb(readValue);
    await Promise.resolve();
    await Promise.resolve();
    expect(sent.length).toBe(0);
  });

  it("writes remote clip once and ignores duplicates", async () => {
    const service = createClipboardService("chrome", { pollIntervalMs: 50 });
    const events: Clip[] = [];
    service.onRemoteClipWritten((c) => events.push(c));
    const clip: Clip = {
      id: "1",
      type: "text",
      content: "hi",
      timestamp: Date.now(),
      senderId: "remote",
    };
    await service.writeRemoteClip(clip);
    await service.writeRemoteClip(clip);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(events.length).toBe(1);
  });
});
