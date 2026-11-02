import { resetOverlapHistoryAccepted } from "../../apps/android/src/resetOverlapHistory";

test("replacement accepts an empty history or the one known post-reset local Clip", () => {
  expect(resetOverlapHistoryAccepted([], "case1", "new-peer")).toBe(true);
  expect(
    resetOverlapHistoryAccepted(
      [{ content: "clipp-reset-case1-after-send", originPeerId: "new-peer" }],
      "case1",
      "new-peer"
    )
  ).toBe(true);
  expect(
    resetOverlapHistoryAccepted(
      [{ content: "clipp-reset-case1-after-send", originPeerId: "old-peer" }],
      "case1",
      "new-peer"
    )
  ).toBe(false);
  expect(
    resetOverlapHistoryAccepted(
      [{ content: "clipp-reset-case1-during-send", originPeerId: "new-peer" }],
      "case1",
      "new-peer"
    )
  ).toBe(false);
  expect(
    resetOverlapHistoryAccepted(
      [
        { content: "clipp-reset-case1-after-send", originPeerId: "new-peer" },
        { content: "clipp-reset-case1-after-send", originPeerId: "new-peer" },
      ],
      "case1",
      "new-peer"
    )
  ).toBe(false);
});
