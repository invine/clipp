import { shouldPrune, pruneHistoryItems } from "../../../packages/core/history/prune";
import { HistoryItem } from "../../../packages/core/models/HistoryItem";
import { Clip } from "../../../packages/core/models/Clip";

const now = Date.now();

function item(id: string, opts: Partial<Clip> = {}): HistoryItem {
  const clip: Clip = {
    id,
    type: "text",
    content: id,
    originPeerId: "me",
    capturedAt: now,
    shareExpiresAt: now + 86_400_000,
    ...opts,
  } as Clip;
  return { clip, firstStoredAt: clip.capturedAt, liveHandled: true };
}

describe("pruneHistoryItems", () => {
  it("prunes expired clips", () => {
    const expired = item("exp", { shareExpiresAt: now - 1 });
    expect(shouldPrune(expired, now)).toBe(true);
  });

  it("prunes very old clips", () => {
    const old = item("old", { capturedAt: now - 366 * 24 * 60 * 60 * 1000 });
    expect(shouldPrune(old, now)).toBe(true);
  });

  it("filters list correctly", () => {
    const keep = item("keep");
    const expired = item("exp", { shareExpiresAt: now - 1 });
    const old = item("old", { capturedAt: now - 366 * 24 * 60 * 60 * 1000 });
    const res = pruneHistoryItems([keep, expired, old], now);
    expect(res).toHaveLength(1);
    expect(res[0].clip.id).toBe("keep");
  });
});
