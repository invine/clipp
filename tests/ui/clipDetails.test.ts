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
it("leads with Clip content and actions, with technical metadata available on disclosure", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      clip: {
        id: "clip-id",
        type: "url",
        content: "https://example.test/a-long-resource",
        originPeerId: "peer-id",
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      sourceName: "Laptop",
      pinned: false,
      disabled: false,
      actions: {},
      onCopy() {},
      onPin() {},
      onDelete() {},
      onRetry() {},
      onDismiss() {},
      onHistory() {},
    })
  );
  expect(output.indexOf("https://example.test/a-long-resource")).toBeLessThan(
    output.indexOf("More Clip actions and information")
  );
  expect(output).toContain("Link");
  expect(output).toContain('aria-label="Copy Clip"');
  expect(output).toContain("peer-id");
  expect(output).toContain("clip-id");
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
it("uses stable named Copy/Pin icons and a separate named Delete action in details", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      clip: {
        id: "clip",
        type: "text",
        content: "full content",
        originPeerId: "local",
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      pinned: true,
      disabled: false,
      actions: {},
      onCopy() {},
      onPin() {},
      onDelete() {},
      onRetry() {},
      onDismiss() {},
      onHistory() {},
    })
  );
  expect(output).toContain('aria-label="Copy Clip"');
  expect(output).toContain('aria-label="Unpin Clip"');
  expect(output).toContain('aria-pressed="true"');
  expect(output).toContain('aria-label="Delete Clip"');
});
it("makes the complete source name inspectable beside the exact Peer ID", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      clip: {
        id: "clip",
        type: "text",
        content: "full content",
        originPeerId: "exact-peer-id",
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      sourceName: "👩🏽‍💻".repeat(40) + " source",
      pinned: false,
      disabled: false,
      actions: {},
      onCopy() {},
      onPin() {},
      onDelete() {},
      onRetry() {},
      onDismiss() {},
      onHistory() {},
    })
  );
  expect(output).toContain("👩🏽‍💻".repeat(40) + " source");
  expect(output).toContain("exact-peer-id");
});

it("only presents Share Now when the runtime provides it and states what it shares", () => {
  const clip = {
    id: "clip",
    type: "text" as const,
    content: "historical Clip",
    originPeerId: "local",
    capturedAt: 1,
    shareExpiresAt: 2,
  };
  const base = {
    clip,
    pinned: false,
    disabled: false,
    actions: {},
    onCopy() {},
    onPin() {},
    onDelete() {},
    onRetry() {},
    onDismiss() {},
    onHistory() {},
  };
  const unsupported = renderToStaticMarkup(
    React.createElement(ClipDetails, base)
  );
  expect(unsupported).not.toContain("Share current clipboard now");

  const supported = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      ...base,
      onShareNow() {},
      shareNowAction: { pending: false, feedback: null },
    })
  );
  expect(supported).toContain('aria-label="Share current clipboard now"');
  expect(supported).toContain("Sends your current system clipboard");
  expect(supported).toContain("it does not send this Clip.");
});

it("shows current clipboard Share Now failure feedback inside details", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      clip: {
        id: "clip",
        type: "text",
        content: "historical Clip",
        originPeerId: "local",
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      pinned: false,
      disabled: false,
      actions: {},
      onCopy() {},
      onPin() {},
      onDelete() {},
      onRetry() {},
      onDismiss() {},
      onHistory() {},
      onShareNow() {},
      shareNowAction: {
        pending: false,
        feedback: {
          message:
            "Could not read the current clipboard. Keep Clipp open and try again.",
          action: "retry",
        },
      },
    })
  );
  expect(output).toContain(
    "Could not read the current clipboard. Keep Clipp open and try again."
  );
  expect(output).toContain("Retry");
});

it("shows a confirmed Share Now result without invoking the share callback", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipDetails, {
      clip: {
        id: "clip",
        type: "text",
        content: "historical Clip",
        originPeerId: "local",
        capturedAt: 1,
        shareExpiresAt: 2,
      },
      pinned: false,
      disabled: false,
      actions: {},
      onCopy() {},
      onPin() {},
      onDelete() {},
      onRetry() {},
      onDismiss() {},
      onHistory() {},
      onShareNow() {},
      shareNowAction: {
        pending: false,
        feedback: {
          message: "Shared current clipboard.",
          action: "dismiss",
          status: "success",
        },
      },
    })
  );
  expect(output).toContain("Shared current clipboard.");
  expect(output).toContain("Dismiss");
});
