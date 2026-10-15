import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openDatabase,
  SQLiteHistoryBackend,
  SQLiteKVStore,
} from "../../apps/electron/src/storage";
import { createElectronClipboardService } from "../../apps/electron/src/clipboardFactory";
import { createSettingsHandler } from "../../packages/core/runtime/settingsAuthority";
import { createLocalRetentionPreference } from "../../packages/core/runtime/localRetentionPreference";
import { MemoryHistoryStore } from "../../packages/core/history/store";
import { reuseRetainedClip } from "../../packages/core/clipboard/explicitActions";
import type { Clip } from "../../packages/core/models/Clip";

it("reopens durable Clip preferences with their emitted deadlines, original local retention age, pins and removal suppression", async () => {
  const directory = mkdtempSync(join(tmpdir(), "clipp-clip-preferences-"));
  const databasePath = join(directory, "history.sqlite");
  let now = 1000;
  let nextId = 970;
  const localPeer = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
  const imported: Clip = {
    id: "00000000-0000-4000-8000-000000000969",
    type: "text",
    content: "retained remote Clip",
    originPeerId: "12D3KooWGi7bpytR7s8rjwUHzFh7QE3F5xQmKJ9vPfLvNcTwXaBc",
    capturedAt: 1,
    shareExpiresAt: 86400001,
  };
  const open = async () => {
    const db = openDatabase(databasePath);
    const storage = new SQLiteKVStore(db);
    const history = new MemoryHistoryStore(new SQLiteHistoryBackend(db), {
      now: () => now,
    });
    const retention = createLocalRetentionPreference({
      storage,
      history,
      publish: async () => {},
    });
    let lifetime = 86400000;
    const settings = createSettingsHandler({
      storage,
      retention,
      applySharingLifetime: (value) => {
        lifetime = value;
      },
      applyAutoSync: () => {},
      applyLogLevel: () => {},
      publish: async () => {},
    });
    await settings.read();
    let clipboardText = "";
    const clipboard = createElectronClipboardService({
      history,
      appliedSharingLifetime: () => lifetime,
      getSenderId: () => localPeer,
      now: () => now,
      makeId: () =>
        `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
      readText: async () => clipboardText,
      writeText: async (value) => {
        clipboardText = value;
      },
    });
    clipboard.start();
    return {
      settings,
      history,
      clipboard,
      close: async () => {
        await clipboard.stop();
        db.close();
      },
    };
  };
  let current: Awaited<ReturnType<typeof open>> | null = null;
  try {
    current = await open();
    expect((await current.settings.read()).state).toMatchObject({
      localRetentionMs: 2592000000,
      sharingLifetimeMs: 86400000,
    });
    expect(
      await current.settings.write({
        localRetentionMs: 10000.5,
        sharingLifetimeMs: 5001,
        autoSync: false,
      })
    ).toMatchObject({ status: "applied" });
    await current.history.importBatch([imported]);
    await current.history.setPinned(imported.id, true);
    const first = await current.clipboard.processLocalText("before reopen");
    expect(first).toMatchObject({ capturedAt: 1000, shareExpiresAt: 6001 });
    expect((await current.history.getById(imported.id))?.firstStoredAt).toBe(
      1000
    );
    await current.close();
    current = null;

    now = 2300;
    current = await open();
    expect((await current.settings.read()).state).toMatchObject({
      localRetentionMs: 10000.5,
      sharingLifetimeMs: 5001,
      autoSync: false,
    });
    expect((await current.history.getById(first!.id))?.clip).toEqual(first);
    const next = await current.clipboard.processLocalText("after reopen");
    expect(next).toMatchObject({ capturedAt: 2300, shareExpiresAt: 7301 });
    await current.settings.write({ sharingLifetimeMs: 7003 });
    expect(
      await reuseRetainedClip(imported.id, {
        history: current.history,
        clipboard: current.clipboard,
      })
    ).toMatchObject({
      status: "complete",
      clip: { capturedAt: 2300, shareExpiresAt: 9303, originPeerId: localPeer },
    });
    expect((await current.history.getById(imported.id))?.clip).toEqual(
      imported
    );
    expect((await current.history.getById(imported.id))?.firstStoredAt).toBe(
      1000
    );
    expect(
      await current.settings.write({ localRetentionMs: 1250.5 })
    ).toMatchObject({ status: "applied" });
    expect(await current.history.getById(first!.id)).toBeNull();
    expect((await current.history.getById(next!.id))?.clip).toEqual(next);
    expect((await current.history.getById(imported.id))?.clip).toEqual(
      imported
    );
    await current.close();
    current = null;

    now = 2400;
    current = await open();
    expect((await current.settings.read()).state).toMatchObject({
      localRetentionMs: 1250.5,
      sharingLifetimeMs: 7003,
      autoSync: false,
      retentionError: null,
    });
    await current.history.importBatch([first!]);
    expect(await current.history.getById(first!.id)).toBeNull();
    expect((await current.history.getById(imported.id))?.pinned).toBe(true);
    await current.history.setPinned(imported.id, false);
    expect(await current.history.getById(imported.id)).toBeNull();
    await current.history.importBatch([imported]);
    expect(await current.history.getById(imported.id)).toBeNull();
    expect(
      await current.clipboard.processLocalText("third owner")
    ).toMatchObject({
      capturedAt: 2400,
      shareExpiresAt: 9403,
    });
  } finally {
    await current?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
