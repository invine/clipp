jest.mock(
  "../../clipp-electron-icons-bundle/clipp-purple-64.png",
  () => "icon"
);
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ClipboardApp,
  type ClipboardAppProps,
} from "../../packages/ui/src/ClipboardApp";
import { createUiSession } from "../../packages/ui/src/uiSession";

const props: ClipboardAppProps = {
  clips: [],
  devices: [],
  pending: [],
  peers: [],
  identity: null,
  pinnedIds: [],
  onDeleteClip: () => {},
  onUnpair: () => {},
  onAccept: async () => ({ ok: true, admitted: true }),
  onReject: async () => ({ ok: true, admitted: false }),
  onPairText: async () => ({ ok: true }),
  onRequestPairingCode: async () => null,
  onCopyPairingText: async () => ({ status: "copied" }),
  onReuseClip: () => "complete",
  onShareNow: () => {},
  onSetPinned: () => {},
  onClearAll: () => {},
};
it("Requests presents a pending read without inventing an empty current list", () => {
  const session = createUiSession();
  session.update({ destination: "requests" });
  const input = { ...props, session, requestsLoading: true };
  const output = renderToStaticMarkup(React.createElement(ClipboardApp, input));
  expect(output).toContain("Loading Requests…");
  expect(output).not.toContain("No pending requests.");
});
it("an active History query has a named clear route", () => {
  const session = createUiSession();
  session.update({ search: "needle", filterMode: "pinned" });
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, session })
  );
  expect(output).toContain('aria-label="Clear search"');
});
it("no-match feedback names the active query and Pinned scope", () => {
  const session = createUiSession();
  session.update({ search: "missing", filterMode: "pinned" });
  const clips = [
    {
      id: "synthetic",
      type: "text" as const,
      content: "present",
      originPeerId: "local",
      capturedAt: 1,
      shareExpiresAt: 2,
    },
  ];
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, session, clips })
  );
  expect(output).toContain("No Clips match “missing” in Pinned.");
});
