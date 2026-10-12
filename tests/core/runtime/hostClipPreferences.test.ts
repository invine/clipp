import { createElectronClipboardService } from "../../../apps/electron/src/clipboardFactory";
import { createExtensionClipboardService } from "../../../apps/extension/src/clipboardFactory";
import { createAndroidClipboardService } from "../../../apps/android/src/clipboardFactory";
import { createSettingsHandler } from "../../../packages/core/runtime/settingsAuthority";
import { MemoryHistoryStore } from "../../../packages/core/history/store";
import { reuseRetainedClip } from "../../../packages/core/clipboard/explicitActions";
import type { Clip } from "../../../packages/core/models/Clip";

const peer = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
it.each([
  ["Electron", createElectronClipboardService],
  ["Chrome", createExtensionClipboardService],
  ["Android", createAndroidClipboardService],
] as const)(
  "%s production factory binds applied lifetime to new captures, Copy and Send, preserving old/imported metadata",
  async (_host, create) => {
    let lifetime = 86400000;
    const values = new Map<string, unknown>([["sharingLifetimeMs", 5001]]);
    const owner = createSettingsHandler({
      storage: {
        get: async <T>(key: string) => values.get(key) as T | undefined,
        set: async <T>(key: string, value: T) => {
          values.set(key, value);
        },
      },
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      applySharingLifetime: (value) => {
        lifetime = value;
      },
      publish: async () => {},
    });
    await owner.read();
    const history = new MemoryHistoryStore(undefined, { now: () => 1000 });
    const retained: Clip = {
      id: "00000000-0000-4000-8000-000000000940",
      type: "text",
      content: "old",
      originPeerId: peer,
      capturedAt: 1,
      shareExpiresAt: 86400001,
    };
    await history.importBatch([retained]);
    let text = "baseline";
    let id = 941;
    const clipboard = create({
      history,
      getSenderId: () => peer,
      readText: async () => text,
      writeText: async (value) => {
        text = value;
      },
      now: () => 1000,
      makeId: () => `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
      appliedSharingLifetime: () => lifetime,
    });
    clipboard.start();
    try {
      await clipboard.processLocalText("capture");
      await owner.write({ sharingLifetimeMs: 7003 });
      await reuseRetainedClip(retained.id, { history, clipboard });
      await clipboard.processLocalText(text, { shareNow: true });
      const all = await history.exportAll();
      expect(all.find((clip) => clip.content === "capture")).toMatchObject({
        capturedAt: 1000,
        shareExpiresAt: 6001,
      });
      expect(
        all
          .filter((clip) => clip.id !== retained.id && clip.content === "old")
          .map((clip) => clip.shareExpiresAt)
      ).toEqual([8003, 8003]);
      expect(all.find((clip) => clip.id === retained.id)).toEqual(retained);
    } finally {
      await clipboard.stop();
    }
  }
);

it.each([
  ["Electron", createElectronClipboardService],
  ["Chrome", createExtensionClipboardService],
  ["Android", createAndroidClipboardService],
] as const)(
  "%s production factory retains original pending Clip metadata across setting changes",
  async (_host, create) => {
    jest.useFakeTimers();
    const { InMemoryHistoryBackend } =
      await import("../../../packages/core/history/types");
    const backend = new InMemoryHistoryBackend();
    const mutation = backend.applyHistoryMutation.bind(backend);
    let fail = true;
    backend.applyHistoryMutation = async (input) => {
      if (input.kind === "accept" && fail)
        throw new Error("storage_temporarily_unavailable");
      return mutation(input);
    };
    const history = new MemoryHistoryStore(backend, { now: () => 1000 });
    let lifetime = 5001;
    const clipboard = create({
      history,
      getSenderId: () => peer,
      readText: async () => "",
      now: () => 1000,
      makeId: () => "00000000-0000-4000-8000-000000000949",
      appliedSharingLifetime: () => lifetime,
    });
    clipboard.start();
    try {
      await clipboard.processLocalText("pending");
      lifetime = 7003;
      fail = false;
      await jest.advanceTimersByTimeAsync(1000);
      expect(await history.exportAll()).toEqual([
        expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000949",
          capturedAt: 1000,
          shareExpiresAt: 6001,
        }),
      ]);
    } finally {
      await clipboard.stop();
      jest.useRealTimers();
    }
  }
);

it.each([
  ["Electron", createElectronClipboardService, 1200],
  ["Android", createAndroidClipboardService, 1500],
] as const)(
  "%s production polling reads the current preference for ordinary changes after its startup baseline",
  async (_host, create, interval) => {
    jest.useFakeTimers();
    let text = "startup value";
    const history = new MemoryHistoryStore(undefined, { now: () => 1000 });
    const clipboard = create({
      history,
      getSenderId: () => peer,
      readText: async () => text,
      now: () => 1000,
      makeId: () => "00000000-0000-4000-8000-000000000950",
      appliedSharingLifetime: () => 2592000000,
    });
    clipboard.start();
    clipboard.setPollingEnabled?.(true);
    try {
      await jest.advanceTimersByTimeAsync(interval);
      expect(await history.exportAll()).toEqual([]);
      text = "changed";
      await jest.advanceTimersByTimeAsync(interval);
      expect(await history.exportAll()).toEqual([
        expect.objectContaining({
          content: "changed",
          capturedAt: 1000,
          shareExpiresAt: 2592001000,
        }),
      ]);
    } finally {
      await clipboard.stop();
      jest.useRealTimers();
    }
  }
);
