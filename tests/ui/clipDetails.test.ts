import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClipDetails } from "../../packages/ui/src/ClipDetails";
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
