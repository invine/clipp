import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClipDetails } from "../../packages/ui/src/ClipDetails";
import { createUiSession } from "../../packages/ui/src/uiSession";
import { reuseClipFeedback } from "../../packages/ui/src/clipboardActionFeedback";
it("shows exact entire Clip content, pin state and Copy/Pin/Delete through the owning details consumer", () => {
  const content = "first line\n" + "unbroken".repeat(150) + "\nlast line";
  const output = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      clip: {
        id: "clip",
        type: "text",
        content,
        originPeerId: "local",
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      pinned: true,
      disabled: false,
      actions: {},
      onCopy: () => {},
      onPin: () => {},
      onDelete: () => {},
      onRetry: () => {},
      onDismiss: () => {},
      onHistory: () => {},
    })
  );
  expect(output).toContain(content);
  expect(output).toContain("Copy Clip");
  expect(output).toContain("Unpin Clip");
  expect(output).toContain("Delete Clip");
});
it("announces confirmed Copy in the active details task through the existing action owner", async () => {
  const session = createUiSession();
  await session.runHistoryAction("copy:clip", async () =>
    reuseClipFeedback("complete")
  );
  const output = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      clip: {
        id: "clip",
        type: "text",
        content: "retained text",
        originPeerId: "local",
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      pinned: false,
      disabled: false,
      actions: session.getSnapshot().historyActions,
      onCopy: () => {},
      onPin: () => {},
      onDelete: () => {},
      onRetry: () => {},
      onDismiss: () => {},
      onHistory: () => {},
    })
  );
  expect(output).toContain('<div role="status"><p>Copied to clipboard.</p>');
  expect(output).toContain("Dismiss");
});
