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
    await expect(clipboard.reuseLocalClip(retainedClip())).rejects.toThrow("clipboard_service_inactive");
    await expect(clipboard.processLocalText("before identity startup", { shareNow: true })).resolves.toBeNull();
    expect(stored).toEqual([]);
    clipboard.start();

    await expect(clipboard.reuseLocalClip(retainedClip())).resolves.toEqual(
      expect.objectContaining({ status: "complete" }),
    );
    await clipboard.processLocalText("retained", { shareNow: true });
    await clipboard.processLocalText("retained", { shareNow: true });

    expect(clipboardText).toBe("retained");
    expect(stored.map((clip) => clip.id)).toEqual([
      "00000000-0000-4000-8000-000000000710",
      "00000000-0000-4000-8000-000000000711",
      "00000000-0000-4000-8000-000000000712",
    ]);
    await clipboard.stop();
    await expect(clipboard.reuseLocalClip(retainedClip())).rejects.toThrow("clipboard_service_inactive");
    await expect(clipboard.processLocalText("after identity shutdown", { shareNow: true })).resolves.toBeNull();
  });

  it("reuses a prepared event identity when action completion recovers after durable acceptance", async () => {
    const stored = new Map<string, Clip>();
    const published: Clip[] = [];
    let storageAvailable = false;
    const clipboard = createRuntimeClipboardService({
      capabilities: runtimeCapabilities,
      getSenderId: () => originPeerId,
      readText: async () => "",
      history: {
        accept: async (clip) => {
          if (!storageAvailable) throw new Error("storage unavailable");
          const existing = stored.get(clip.id);
          if (existing) return { kind: "exact-duplicate", clip: existing, liveHandled: true };
          stored.set(clip.id, clip);
          return { kind: "newly-stored", clip, liveHandled: true };
        },
      },
    });
    clipboard.onLocalClip((clip) => published.push(clip));
    clipboard.start();
    const event = {
      clipId: "00000000-0000-4000-8000-000000000799",
      capturedAt: 123,
    };

    await expect(clipboard.processLocalText("persisted action", { shareNow: true, event })).resolves.toBeNull();
    storageAvailable = true;
    await expect(clipboard.processLocalText("persisted action", { shareNow: true, event })).resolves.toBeNull();

    expect([...stored.values()]).toEqual([expect.objectContaining({
      id: event.clipId,
      capturedAt: event.capturedAt,
      content: "persisted action",
    })]);
    expect(published.map((clip) => clip.id)).toEqual([event.clipId]);
    await clipboard.stop();
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
    clipboard.start();

    await expect(clipboard.reuseLocalClip(retainedClip())).rejects.toThrow("clipboard unavailable");
    expect(accept).not.toHaveBeenCalled();
    await clipboard.stop();
  });
});

describe("Chrome extension retained Clip outcomes", () => {
  it("reports partial success when capture setup fails after the clipboard write", async () => {
    let clipboardText = "current";
    const accept = jest.fn();
    const clipboard = createRuntimeClipboardService({
      capabilities: RUNTIME_CAPABILITIES.chromeExtension,
      getSenderId: async () => { throw new Error("identity unavailable"); },
      writeText: async (text) => { clipboardText = text; },
      history: { accept },
    });
    clipboard.start();

    await expect(clipboard.reuseLocalClip(retainedClip())).resolves.toEqual({
      status: "copied-without-clip",
    });
    expect(clipboardText).toBe("retained");
    expect(accept).not.toHaveBeenCalled();
    await clipboard.stop();
  });
});
