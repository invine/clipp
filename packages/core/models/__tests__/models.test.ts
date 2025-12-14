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
      id: "uuid-1",
      type: ClipType.Text,
      content: "hello",
      timestamp: Date.now(),
      senderId: "peer-A",
    };
    expect(validateClip(clip)).toBe(true);
  });

  it("creates a valid history item", () => {
    const clip: Clip = {
      id: "uuid-2",
      type: ClipType.Text,
      content: "world",
      timestamp: Date.now(),
      senderId: "peer-A",
    };
    const item: HistoryItem = {
      clip,
      receivedFrom: "peer-A",
      syncedAt: Date.now(),
      isLocal: true,
    };
    expect(validateHistoryItem(item)).toBe(true);
  });
});
