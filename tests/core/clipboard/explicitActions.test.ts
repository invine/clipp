import { reuseRetainedClip } from "../../../packages/core/clipboard/explicitActions";
import { createClipCaptureCoordinator } from "../../../packages/core/clipboard/captureCoordinator";
import { createManualClipboardService } from "../../../packages/core/clipboard/service";
import { MemoryHistoryStore } from "../../../packages/core/history/store";
import type { Clip } from "../../../packages/core/models/Clip";

const localPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";

function retainedClip(): Clip {
  return {
    id: "00000000-0000-4000-8000-000000000700",
    type: "text",
    content: "retained value",
    originPeerId: "12D3KooWGi7bpytR7s8rjwUHzFh7QE3F5xQmKJ9vPfLvNcTwXaBc",
    capturedAt: 1,
    shareExpiresAt: 86_400_001,
  };
}

describe("explicit Clip actions", () => {
  it("reuses a retained Clip through the shared history action", async () => {
    const history = new MemoryHistoryStore();
    await history.accept(retainedClip(), { liveHandled: true });
    const clipboard = createManualClipboardService({
      getSenderId: () => localPeerId,
      writeText: async () => {},
      captureCoordinator: createClipCaptureCoordinator({
        history,
        originPeerId: () => localPeerId,
        now: () => 5_000,
        makeId: () => "00000000-0000-4000-8000-000000000701",
      }),
    });
    clipboard.start();

    const reused = await reuseRetainedClip("00000000-0000-4000-8000-000000000700", {
      history,
      clipboard,
    });

    expect(reused).toEqual(expect.objectContaining({
      id: "00000000-0000-4000-8000-000000000701",
      content: "retained value",
      originPeerId: localPeerId,
      capturedAt: 5_000,
    }));
    await clipboard.stop();
  });
});
