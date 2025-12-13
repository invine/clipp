import { createPollingClipboardService } from "../service";
import type { Clip } from "../../models/Clip";
import { jest } from "@jest/globals";

let clipboard = "";
const readMock = jest.fn(async () => clipboard);
const writeMock = jest.fn(async (_: string) => {});

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
});
