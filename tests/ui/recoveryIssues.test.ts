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
const render = (more: Partial<ClipboardAppProps>) =>
  renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, ...more })
  );
it("composes independent source faults once through the shared shell and retains recovery after Close", () => {
  const session = createUiSession();
  const faults: Partial<ClipboardAppProps> = {
    session,
    initializationError: true,
    historyUnavailable: true,
    historyRefreshError: "disk",
    clipboardHistoryError: "pending_capture_failed",
    historyPolicyError: "history_cleanup_failed",
    pairingErrors: [
      { targetPeerId: "peer-a", code: "membership_persistence_failed" },
      { targetPeerId: "peer-a", code: "membership_persistence_failed" },
    ],
    managedRelayStates: [
      {
        key: "a",
        name: "A",
        kind: "managed",
        status: "refused",
        reason: "quota",
      },
      {
        key: "b",
        name: "B",
        kind: "managed",
        status: "retrying",
        reason: "network",
      },
    ],
  };
  expect(render(faults)).toContain("7 issues need attention");
  session.open({ kind: "issues", origin: "issues-summary" });
  const html = render(faults);
  expect(html).toContain(
    'data-issue-id="pairing:peer-a:membership_persistence_failed"'
  );
  expect(html.match(/data-issue-id="history:read:unavailable"/g)).toHaveLength(
    1
  );
  expect(html).toContain("retry pending Clips automatically");
  expect(html).toContain('class="task-dialog recovery-task"');
  session.close();
  expect(render(faults)).toContain("7 issues need attention");
  expect(render({ ...faults, pairingErrors: [] })).toContain(
    "6 issues need attention"
  );
});
it("keeps ordinary offline devices and empty relays out of the fault count and blocks cold identity actions", () => {
  const html = render({ initializationError: true });
  expect(html).toContain("1 issue needs attention");
  expect(html).toMatch(/disabled=""[^>]*>Add/);
  expect(html).toMatch(
    /disabled=""[^>]*aria-label="Share current clipboard now"|aria-label="Share current clipboard now"[^>]*disabled=""/
  );
  expect(render({})).not.toContain("issues need attention");
});
it("retains scoped Copy and Send failures, never retries copied-without-clip, and keeps a failed Retry discoverable", async () => {
  const session = createUiSession();
  const copy = jest.fn(async () => ({
    message:
      "Copied to clipboard, but Clipp could not save or share a new Clip.",
    action: "dismiss" as const,
  }));
  const send = jest.fn(async () => ({
    message: "Could not read the current clipboard.",
    action: "retry" as const,
  }));
  await session.runHistoryAction("copy:clip-a", copy);
  await session.runHistoryAction("send:current", send);
  await session.retryHistoryAction("copy:clip-a");
  expect(copy).toHaveBeenCalledTimes(1);
  await session.retryHistoryAction("send:current");
  expect(send).toHaveBeenCalledTimes(2);
  session.open({ kind: "issues", origin: "issues-summary" });
  expect(render({ session })).toContain("2 issues need attention");
  session.dismissHistoryAction("copy:clip-a");
  expect(
    render({ session, clipboardHistoryError: "pending_capture_failed" })
  ).toContain("2 issues need attention");
  await session.runHistoryAction("send:current", async () => null);
  expect(
    render({ session, clipboardHistoryError: "pending_capture_failed" })
  ).toContain("1 issue needs attention");
});
it("keeps a failed Device Name draft discoverable after switching tasks and does not discard it to inspect diagnostics", async () => {
  const session = createUiSession();
  session.open({
    kind: "device-name",
    entity: "local",
    origin: "rename-local",
  });
  session.name.begin("local", "Desktop");
  session.name.change("Retained desk");
  await session.name.save(async () => {
    throw new Error("rename_outcome_unconfirmed");
  });
  session.open({ kind: "relay", entity: "a", origin: "relay:a" });
  session.open({ kind: "issues", origin: "issues-summary" });
  const html = render({
    session,
    identity: { deviceId: "local", deviceName: "Desktop" },
  });
  expect(html).toContain('data-issue-id="task:local:device-name"');
  expect(html).toContain("Open Device Name");
  expect(session.name.getSnapshot().raw).toBe("Retained desk");
});
it("does not revive an old identity's late action failure after Identity Rotation", async () => {
  const session = createUiSession();
  let finish!: (value: { message: string; action: "retry" }) => void;
  const pending = session.runHistoryAction(
    "copy:old-clip",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  session.rotateIdentity();
  finish({ message: "Old Copy failed", action: "retry" });
  await pending;
  expect(render({ session })).not.toContain("Old Copy failed");
  expect(session.getSnapshot().historyActions).toEqual({});
});
