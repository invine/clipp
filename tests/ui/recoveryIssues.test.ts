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
import { reuseClipFeedback } from "../../packages/ui/src/clipboardActionFeedback";

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
it("presents confirmed Copy without counting it as a problem while partial Copy remains actionable", async () => {
  const session = createUiSession();
  await session.runHistoryAction("copy:clip-a", async () =>
    reuseClipFeedback("complete")
  );
  expect(render({ session })).toContain("Copied to clipboard.");
  session.open({ kind: "issues", origin: "issues-summary" });
  expect(render({ session })).not.toContain("issue needs attention");
  expect(render({ session })).not.toContain("action_failed");
  await session.runHistoryAction("copy:clip-b", async () =>
    reuseClipFeedback("copied-without-clip")
  );
  const html = render({ session });
  expect(html).toContain("1 issue needs attention");
  expect(html).toContain('data-issue-id="history:copy:clip-b:action_failed"');
  expect(html).not.toContain(
    'data-issue-id="history:copy:clip-a:action_failed"'
  );
});
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
  const session = createUiSession();
  session.update({ destination: "devices" });
  const html = render({ initializationError: true, session });
  expect(html).toContain("1 issue needs attention");
  expect(html).toMatch(/disabled=""[^>]*>Pair this device/);
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
it("keeps independent suspended alias and relay failures visible when B becomes selected and A completes late", async () => {
  const session = createUiSession();
  const a = {
    key: "a",
    name: "A",
    kind: "managed" as const,
    discoveryUrl: "https://a.example/v1/relay",
  };
  const b = { ...a, key: "b", name: "B" };
  session.open({ kind: "alias", entity: "alias-a", origin: "rename:alias-a" });
  session.alias.begin("alias-a", "Alias A");
  session.alias.change("Retained A");
  let failAlias!: (error: Error) => void;
  const seenAliasErrors: unknown[] = [];
  session.alias.subscribe(() =>
    seenAliasErrors.push(session.alias.getErrors())
  );
  const pendingAlias = session.alias.save(
    () =>
      new Promise((_, reject) => {
        failAlias = reject;
      })
  );
  session.open({ kind: "alias", entity: "alias-b", origin: "rename:alias-b" });
  session.alias.begin("alias-b", "Alias B");
  session.open({ kind: "relay", entity: "a", origin: "relay:a" });
  session.relay.begin(a);
  session.relay.change("name", "Retained relay A");
  let failRelay!: (error: Error) => void;
  const seenRelayErrors: unknown[] = [];
  session.relay.subscribe(() =>
    seenRelayErrors.push(session.relay.getErrors())
  );
  const pendingRelay = session.relay.save(
    () =>
      new Promise((_, reject) => {
        failRelay = reject;
      })
  );
  session.open({ kind: "relay", entity: "b", origin: "relay:b" });
  session.relay.begin(b);
  session.open({ kind: "issues", origin: "issues-summary" });
  failAlias(new Error("rename_outcome_unconfirmed"));
  failRelay(new Error("offline"));
  await Promise.all([pendingAlias, pendingRelay]);
  expect(seenAliasErrors.at(-1)).toEqual([
    { targetId: "alias-a", error: "rename_outcome_unconfirmed" },
  ]);
  expect(session.alias.getSnapshot().targetId).toBe("alias-b");
  expect(session.relay.getSnapshot()?.key).toBe("b");
  expect(seenRelayErrors.at(-1)).toEqual([
    expect.objectContaining({ key: "a" }),
  ]);
  const views = {
    session,
    managedRelayConfigurations: [a, b],
    devices: [
      { deviceId: "alias-a", deviceName: "Alias A" },
      { deviceId: "alias-b", deviceName: "Alias B" },
    ],
  };
  const html = render(views);
  expect(html).toContain('data-issue-id="task:alias-a:alias"');
  expect(html).toContain('data-issue-id="task:a:relay-edit"');
  expect(html).toContain("2 issues need attention");
  session.alias.begin("alias-a", "Alias A");
  expect(session.alias.getSnapshot().raw).toBe("Retained A");
  await session.alias.save(async () => ({ deviceId: "alias-a" }));
  expect(render(views)).toContain("1 issue needs attention");
});
it("the real Requests destination distinguishes response, current Membership and recovery without losing the Pairing draft", () => {
  const session = createUiSession();
  session.pairing.change("newer draft");
  session.update({ destination: "requests" });
  const html = render({
    session,
    identity: { deviceId: "local", deviceName: "Desktop" },
    devices: [{ deviceId: "peer-a", deviceName: "Mobile" }],
    pairingOutcomes: [
      {
        targetPeerId: "peer-a",
        response: "rejected",
        waitingEnded: false,
        recovering: false,
      },
      {
        targetPeerId: "peer-b",
        response: "accepted",
        waitingEnded: false,
        recovering: true,
      },
      {
        targetPeerId: "peer-c",
        response: null,
        waitingEnded: true,
        recovering: false,
      },
    ],
    onDismissPairingOutcome: async () => true,
  });
  expect(html).toContain("Rejection response received");
  expect(html).toContain("Currently paired");
  expect(html).toContain("Acceptance response received");
  expect(html).toContain("Retrying local membership storage automatically");
  expect(html).toContain("Waiting ended without observing a response");
  expect(html).toContain("Dismiss notice for peer-a");
  expect(html).not.toContain("Dismiss notice for peer-b");
  expect(session.pairing.getSnapshot().raw).toBe("newer draft");
});

it("keeps an applied-but-unsaved history policy reachable from History and explains completed cleanup", async () => {
  const { createSettingsClient } =
    await import("../../packages/core/runtime/settingsClient");
  const client = createSettingsClient({
    send: async () => ({
      ok: true,
      snapshot: {
        sessionId: "current",
        revision: 1,
        state: {
          theme: "system",
          autoSync: true,
          logLevel: "info",
          sharingLifetimeMs: 86400000,
          localRetentionMs: 0,
          retentionError: "persistence_unavailable",
        },
      },
    }),
    subscribe: () => () => {},
  });
  await client.start();
  const appearanceSettings = {
    ...client.getState(),
    save: client.save,
    refresh: client.refresh,
  };
  const session = createUiSession();
  const history = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, appearanceSettings, session })
  );
  expect(history).toContain("1 issue needs attention");
  session.open({ kind: "issues", origin: "issues-summary" });
  const issues = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, appearanceSettings, session })
  );
  expect(issues).toContain("completed cleanup remains in effect");
  client.stop();
});

it("removes both the global Issue and partial-save message after acknowledged retention recovery", async () => {
  const { createSettingsClient } =
    await import("../../packages/core/runtime/settingsClient");
  const snapshot = (revision: number, retentionError: string | null) => ({
    sessionId: "authority",
    revision,
    state: {
      theme: "system" as const,
      autoSync: true,
      logLevel: "info" as const,
      sharingLifetimeMs: 86400000,
      localRetentionMs: 0,
      retentionError,
    },
  });
  let current = snapshot(1, null),
    // eslint-disable-next-line no-unused-vars
    publish!: (message: unknown) => void;
  const client = createSettingsClient({
    send: async (message) => {
      if (message.type === "getSettings")
        return { ok: true, snapshot: current };
      current = snapshot(2, "retention_persistence_failed");
      return {
        status: "partial",
        failureOrigin: "localRetention",
        error: "retention_persistence_failed",
        snapshot: current,
      };
    },
    subscribe: (listener) => {
      publish = listener;
      return () => {};
    },
  });
  await client.start();
  await client.save({ localRetentionMs: 0 });
  const session = createUiSession();
  session.update({ destination: "settings" });
  const renderCurrent = () =>
    render({
      session,
      appearanceSettings: {
        ...client.getState(),
        save: client.save,
        refresh: client.refresh,
      },
    });
  expect(renderCurrent()).toContain("1 issue needs attention");
  expect(renderCurrent()).toContain("only partly saved");
  current = snapshot(3, null);
  publish({ type: "settingsState", snapshot: current });
  expect(renderCurrent()).not.toContain("1 issue needs attention");
  expect(renderCurrent()).not.toContain("only partly saved");
  expect(renderCurrent()).not.toContain("retention_persistence_failed");
  client.stop();
});

it("retires the latest cleanup failure after real retention recovery even while an older persistence cause was projected", async () => {
  const { MemoryHistoryStore } =
    await import("../../packages/core/history/store");
  const { InMemoryHistoryBackend } =
    await import("../../packages/core/history/types");
  const { createLocalRetentionPreference } =
    await import("../../packages/core/runtime/localRetentionPreference");
  const { createSettingsHandler } =
    await import("../../packages/core/runtime/settingsAuthority");
  const { createSettingsClient } =
    await import("../../packages/core/runtime/settingsClient");
  const values = new Map<string, unknown>();
  let writable = false;
  const storage = {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    set: async <T>(key: string, value: T) => {
      if (key === "localRetentionMs" && !writable) throw Error("persistence_A");
      values.set(key, value);
    },
  };
  const backend = new InMemoryHistoryBackend(),
    history = new MemoryHistoryStore(backend);
  const retention = createLocalRetentionPreference({
    storage,
    history,
    publish: async () => {},
  });
  // eslint-disable-next-line no-unused-vars
  const listeners = new Set<(message: unknown) => void>();
  const publish = async (snapshot: unknown) => {
    for (const listener of listeners)
      listener({ type: "settingsState", snapshot });
  };
  const authority = createSettingsHandler({
    storage,
    retention,
    applyAutoSync: () => {},
    applyLogLevel: () => {},
    publish,
    sessionId: "owner",
  });
  const client = createSettingsClient({
    send: async (message) =>
      message.type === "getSettings"
        ? { ok: true, snapshot: await authority.read() }
        : authority.write(message.settings),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  await client.start();
  await client.save({ localRetentionMs: 0 });
  expect(client.getState().feedback?.error).toBe("persistence_A");
  const originalMutation = backend.applyHistoryMutation.bind(backend);
  backend.applyHistoryMutation = async () => {
    throw Error("cleanup_B");
  };
  const failed = await client.save({ localRetentionMs: 5001 });
  expect(failed).toMatchObject({
    status: "rejected",
    error: "cleanup_B",
    snapshot: { state: { retentionError: "persistence_A" } },
  });
  const invalid = await authority.write({ localRetentionMs: -1 });
  expect(invalid).toMatchObject({
    status: "rejected",
    error: "invalid_settings",
  });
  expect("failureOrigin" in invalid).toBe(false);
  const session = createUiSession();
  session.update({ destination: "settings" });
  const renderCurrent = () =>
    render({
      session,
      appearanceSettings: {
        ...client.getState(),
        save: client.save,
        refresh: client.refresh,
      },
    });
  expect(renderCurrent()).toContain("1 issue needs attention");
  expect(renderCurrent()).toContain("cleanup_B");
  writable = true;
  backend.applyHistoryMutation = originalMutation;
  await retention.retry();
  await publish(await authority.read());
  expect(client.getState().snapshot?.state.retentionError).toBeNull();
  expect(client.getState().feedback).toBeNull();
  expect(renderCurrent()).not.toContain("1 issue needs attention");
  expect(renderCurrent()).not.toContain("cleanup_B");
  client.stop();
});

it("keeps popup read health independent from Copy/Send and exposes ordinary capture Retry", async () => {
  const session = createUiSession();
  await session.runHistoryAction("copy:clip-a", async () => null);
  session.open({ kind: "issues", origin: "issues-summary" });
  const html = render({
    session,
    popupCapture: { pending: false, error: "read_failed" },
    onRetryPopupCapture: async () => false,
  });
  expect(html).toContain('data-issue-id="clipboard:focus:observation"');
  expect(html).toContain("Could not read the clipboard in this popup.");
  expect(html).toContain(">Retry</button>");
  expect(html).not.toContain(">Dismiss</button>");
  expect(
    render({
      session,
      popupCapture: { pending: false, error: "handoff_unconfirmed" },
      onRetryPopupCapture: async () => false,
    })
  ).toContain("Clipboard observation could not be confirmed");
});
