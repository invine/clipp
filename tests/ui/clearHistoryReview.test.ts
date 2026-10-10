import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClearHistoryReview } from "../../packages/ui/src/ClearHistoryReview";

describe("Clear all local history review", () => {
  it("names the full local consequence, including pinned and filtered-out Clips", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClearHistoryReview, {
        totalCount: 5,
        pinnedCount: 2,
        filteredOutCount: 3,
        pending: false,
        error: null,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      })
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("5 local Clips");
    expect(html).toContain("2 pinned");
    expect(html).toContain("3 outside the current filters");
    expect(html).toContain("other devices");
    expect(html).toContain("cannot be undone");
    expect(html).toContain("Cancel");
    expect(html).toContain("Clear all local history");
  });

  it("keeps recovery in the review and blocks duplicate actions while pending", () => {
    const pending = renderToStaticMarkup(
      React.createElement(ClearHistoryReview, {
        totalCount: 1,
        pinnedCount: 1,
        filteredOutCount: 1,
        pending: true,
        error: null,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      })
    );
    expect(pending).toContain("Clearing local history");
    expect(pending.match(/disabled=""/g)).toHaveLength(2);

    const failed = renderToStaticMarkup(
      React.createElement(ClearHistoryReview, {
        totalCount: 1,
        pinnedCount: 1,
        filteredOutCount: 1,
        pending: false,
        error: "Clear could not be confirmed.",
        onCancel: () => undefined,
        onConfirm: () => undefined,
      })
    );
    expect(failed).toContain("Clear could not be confirmed.");
    expect(failed).toContain("Retry Clear");
    expect(failed).toContain("Close");
  });
});
