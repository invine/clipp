import { createClipboardService } from "../service";
import type { Clip } from "../../models/Clip";
import { jest } from "@jest/globals";

let clipboard = "";
export const readMock = jest.fn(async () => clipboard);
export const writeMock = jest.fn(async (_: string) => {});

jest.mock("../platform/chrome", () => ({
  readText: () => readMock(),
  writeText: (t: string) => writeMock(t),
}));

describe("Echo prevention", () => {
  beforeEach(() => {
    clipboard = "";
    readMock.mockClear();
    writeMock.mockClear();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("ignores echoed remote clip", async () => {
    const sendClipMock = jest.fn(async () => {});
    const service = createClipboardService("chrome", { pollIntervalMs: 1000, sendClip: sendClipMock });
    service.start();
    clipboard = "X";
    jest.advanceTimersByTime(1000);
    await jest.runOnlyPendingTimersAsync();
    expect(sendClipMock).toHaveBeenCalled();
    const localClip = (sendClipMock.mock.calls[0] as any)[0] as Clip;
    writeMock.mockClear();
    await service.writeRemoteClip(localClip);
    expect(writeMock).not.toHaveBeenCalled();
  });
});
