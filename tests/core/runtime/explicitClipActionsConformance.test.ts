import { RUNTIME_CAPABILITIES } from "../../../packages/core/runtime/capabilities";
import { createRuntimeClipboardService } from "../../../packages/core/runtime/clipboard";
import type { Clip } from "../../../packages/core/models/Clip";

const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
const capabilities = Object.values(RUNTIME_CAPABILITIES);

function retainedClip(): Clip {
  return {
    id: "00000000-0000-4000-8000-000000000700",
    type: "text",
    content: "retained",
    originPeerId,
    capturedAt: 1,
    shareExpiresAt: 86_400_001,
  };
}

describe.each(capabilities)("$platform explicit Clip actions", (runtimeCapabilities) => {
  it("reuses retained content and creates a distinct event for every Share Now action", async () => {
    const stored: Clip[] = [];
    let clipboardText = "current";
    let nextId = 710;
    const clipboard = createRuntimeClipboardService({
      capabilities: runtimeCapabilities,
      getSenderId: () => originPeerId,
      readText: async () => clipboardText,
      writeText: async (text) => { clipboardText = text; },
      makeId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
      history: {
        accept: async (clip) => {
          stored.push(clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
    });

    await clipboard.reuseLocalClip(retainedClip());
    await clipboard.processLocalText("retained", { shareNow: true });
    await clipboard.processLocalText("retained", { shareNow: true });

    expect(clipboardText).toBe("retained");
    expect(stored.map((clip) => clip.id)).toEqual([
      "00000000-0000-4000-8000-000000000710",
      "00000000-0000-4000-8000-000000000711",
      "00000000-0000-4000-8000-000000000712",
    ]);
  });

  it("creates no event when a retained-Clip write fails", async () => {
    const accept = jest.fn();
    const clipboard = createRuntimeClipboardService({
      capabilities: runtimeCapabilities,
      getSenderId: () => originPeerId,
      readText: async () => "current",
      writeText: async () => { throw new Error("clipboard unavailable"); },
      history: { accept },
    });

    await expect(clipboard.reuseLocalClip(retainedClip())).rejects.toThrow("clipboard unavailable");
    expect(accept).not.toHaveBeenCalled();
  });
});
