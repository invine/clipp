import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PairingCodeContent } from "../../packages/ui/src/PairingCodeContent";
import type { PairingCodeTaskState } from "../../packages/ui/src/pairingCodeTask";

const render = (state: PairingCodeTaskState) =>
  renderToStaticMarkup(
    React.createElement(PairingCodeContent, {
      state,
      onRetry: () => undefined,
      onCopy: () => undefined,
    })
  );
it("renders pending generation and an actionable generation failure", () => {
  expect(
    render({ open: true, generation: "pending", code: null, copy: "idle" })
  ).toContain("Creating QR code");
  const failed = render({
    open: true,
    generation: "error",
    code: null,
    copy: "idle",
  });
  expect(failed).toContain("Unable to create");
  expect(failed).toContain("Retry QR generation");
  expect(failed).not.toContain("Copy pairing text");
});
it("keeps text fallback available and distinguishes Copy uncertainty from rejection", () => {
  const ready: PairingCodeTaskState = {
    open: true,
    generation: "ready",
    code: { image: null, text: "target" },
    copy: "unconfirmed",
  };
  expect(render(ready)).toContain("too large for a QR code");
  expect(render(ready)).toContain("may have been copied");
  expect(render(ready)).toContain("Copy again");
  expect(render({ ...ready, copy: "rejected" })).toContain("Could not copy");
  expect(render({ ...ready, copy: "copied" })).toContain("Pairing text copied");
  expect(render({ ...ready, copy: "pending" })).toMatch(
    /disabled=""[^>]*>Copying/
  );
});
