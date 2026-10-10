import { createHistoryStateReader } from "../../../packages/core/history/state";
import type { HistorySnapshot } from "../../../packages/core/history/store";

describe("History state reader", () => {
  it("distinguishes unavailable, last-known, and recovered snapshots across actual reads", async () => {
    const first: HistorySnapshot = {
      revision: 1,
      clips: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          type: "text",
          content: "retained",
          originPeerId: "me",
          capturedAt: 1,
          shareExpiresAt: 60_001,
        },
      ],
      pinnedIds: [],
    };
    const second: HistorySnapshot = {
      ...first,
      revision: 2,
      pinnedIds: [first.clips[0].id],
    };
    const outcomes = [
      new Error("initial outage"),
      first,
      new Error("refresh outage"),
      second,
    ];
    const reader = createHistoryStateReader({
      snapshot: async () => {
        const next = outcomes.shift();
        if (next instanceof Error) throw next;
        return next!;
      },
    });

    await expect(reader.read()).resolves.toMatchObject({
      clips: [],
      pinnedIds: [],
      historyUnavailable: true,
      historyRefreshError: true,
    });
    await expect(reader.read()).resolves.toMatchObject({
      clips: first.clips,
      pinnedIds: [],
      historyUnavailable: false,
      historyRefreshError: false,
    });
    await expect(reader.read()).resolves.toMatchObject({
      clips: first.clips,
      pinnedIds: [],
      historyUnavailable: false,
      historyRefreshError: true,
    });
    await expect(reader.read()).resolves.toMatchObject({
      clips: second.clips,
      pinnedIds: second.pinnedIds,
      historyUnavailable: false,
      historyRefreshError: false,
    });
  });
});
