import {
  Clip,
  HistoryItem,
  ClipType,
  validateClip,
  validateHistoryItem,
} from "../index";

describe("Data-model sanity", () => {
  it("creates a valid text clip", () => {
    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000001",
      type: ClipType.Text,
      content: "hello",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: Date.now(),
      shareExpiresAt: Date.now() + 1_000,
    };
    expect(validateClip(clip)).toBe(true);
  });

  it("creates a valid history item", () => {
    const clip: Clip = {
      id: "00000000-0000-4000-8000-000000000002",
      type: ClipType.Text,
      content: "world",
      originPeerId: "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy",
      capturedAt: Date.now(),
      shareExpiresAt: Date.now() + 1_000,
    };
    const item: HistoryItem = {
      clip,
      firstStoredAt: Date.now(),
      liveHandled: true,
    };
    expect(validateHistoryItem(item)).toBe(true);
  });
});
