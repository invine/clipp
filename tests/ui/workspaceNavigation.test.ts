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
import { createSettingsClient } from "../../packages/core/runtime/settingsClient";

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
it("management surface omits current clipboard Send capability when its owner is absent", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, onShareNow: undefined })
  );
  expect(output).not.toContain("Share current clipboard now");
  expect(output).not.toContain("Sends your current system clipboard");
});
it("keeps the applied Log level focusable and busy during a single pending save", async () => {
  const snapshot = {
    sessionId: "settings",
    revision: 1,
    state: {
      theme: "system" as const,
      autoSync: true,
      logLevel: "info" as const,
      localRetentionMs: 1000,
      sharingLifetimeMs: 5000,
    },
  };
  let finish!: (result: unknown) => void;
  const client = createSettingsClient({
    send: async (message) =>
      message.type === "getSettings"
        ? { ok: true, snapshot }
        : new Promise((resolve) => {
            finish = resolve;
          }),
    subscribe: () => () => {},
  });
  const session = createUiSession();
  session.update({ destination: "settings" });
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ClipboardApp, {
        ...props,
        session,
        appearanceSettings: {
          ...client.getState(),
          save: client.save,
          refresh: client.refresh,
        },
      })
    );
  await client.start();
  const saving = client.save({ logLevel: "warn" });
  const select = render().match(
    /<select[^>]*aria-label="Log level"[^>]*>/
  )?.[0];
  expect(select).toContain('aria-disabled="true"');
  expect(select).toContain('aria-busy="true"');
  expect(select).not.toContain('disabled=""');
  expect(render()).toContain('value="info" selected=""');
  expect(await client.save({ logLevel: "error" })).toMatchObject({
    status: "unconfirmed",
    error: "settings_reconciliation_required",
  });
  finish({
    status: "applied",
    snapshot: {
      ...snapshot,
      revision: 2,
      state: { ...snapshot.state, logLevel: "warn" },
    },
  });
  await saving;
  expect(render()).toContain('value="warn" selected=""');
  expect(render()).toContain("Log level saved.");
  expect(
    render().match(/<select[^>]*aria-label="Log level"[^>]*>/)?.[0]
  ).not.toContain('aria-busy="true"');
  client.stop();
});
it("keeps Log level natively disabled while unknown or awaiting authority recovery", async () => {
  const snapshot = {
    sessionId: "settings",
    revision: 1,
    state: {
      theme: "system" as const,
      autoSync: true,
      logLevel: "info" as const,
      localRetentionMs: 1000,
      sharingLifetimeMs: 5000,
    },
  };
  let reads = 0;
  const client = createSettingsClient({
    send: async (message) => {
      if (message.type === "setSettings") throw new Error("reply_lost");
      if (reads++ === 0) return { ok: true, snapshot };
      throw new Error("refresh_offline");
    },
    subscribe: () => () => {},
  });
  const session = createUiSession();
  session.update({ destination: "settings" });
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ClipboardApp, {
        ...props,
        session,
        appearanceSettings: {
          ...client.getState(),
          save: client.save,
          refresh: client.refresh,
        },
      })
    );
  expect(
    render().match(/<select[^>]*aria-label="Log level"[^>]*>/)?.[0]
  ).toContain('disabled=""');
  expect(render()).toContain('value="" selected="">Unknown');
  await client.start();
  await client.save({ logLevel: "warn" });
  expect(
    render().match(/<select[^>]*aria-label="Log level"[^>]*>/)?.[0]
  ).toContain('disabled=""');
  expect(render()).toContain('value="info" selected=""');
  expect(render()).toContain("Refresh General settings");
  expect(render()).not.toContain("Log level saved.");
  client.stop();
});
it("keeps General Auto Sync focusable while either save owner is busy and preserves recovery exclusion", async () => {
  const snapshot = {
    sessionId: "settings",
    revision: 1,
    state: {
      theme: "system" as const,
      autoSync: true,
      logLevel: "info" as const,
      localRetentionMs: 1000,
      sharingLifetimeMs: 5000,
    },
  };
  let finish!: (result: unknown) => void;
  const client = createSettingsClient({
    send: async (message) =>
      message.type === "getSettings"
        ? { ok: true, snapshot }
        : new Promise((resolve) => {
            finish = resolve;
          }),
    subscribe: () => () => {},
  });
  const session = createUiSession();
  session.update({ destination: "settings" });
  const render = (runtimePending = client.getState().pending) =>
    renderToStaticMarkup(
      React.createElement(ClipboardApp, {
        ...props,
        session,
        autoSyncKnown: client.getState().snapshot !== null,
        autoSync: client.getState().snapshot?.state.autoSync,
        autoSyncPending: runtimePending,
        autoSyncFeedback: client.getState().feedback,
        onSetAutoSync: async (enabled) => {
          await client.save({ autoSync: enabled });
        },
      })
    );
  expect(render().match(/<select[^>]*id="auto-sync"[^>]*>/)?.[0]).toContain(
    'disabled=""'
  );
  await client.start();
  const saving = session.saveAutoSync(async () => {
    await client.save({ autoSync: false });
  });
  for (const html of [render(), render(false)]) {
    const select = html.match(/<select[^>]*id="auto-sync"[^>]*>/)?.[0];
    expect(select).toContain('aria-disabled="true"');
    expect(select).toContain('aria-busy="true"');
    expect(select).not.toContain('disabled=""');
    expect(html).toContain('value="enabled" selected=""');
    expect(html).toContain("Saving Auto Sync…");
    expect(html).not.toContain("Auto Sync saved.");
  }
  await session.saveAutoSync(async () => {
    await client.save({ autoSync: true });
  });
  finish({
    status: "applied",
    autoSync: false,
    snapshot: {
      ...snapshot,
      revision: 2,
      state: { ...snapshot.state, autoSync: false },
    },
  });
  await saving;
  expect(render()).toContain('value="disabled" selected=""');
  expect(render()).toContain("Auto Sync saved.");
  await session.saveAutoSync(async () => ({
    status: "unconfirmed",
    autoSync: false,
    error: "reply_lost",
  }));
  expect(render().match(/<select[^>]*id="auto-sync"[^>]*>/)?.[0]).toContain(
    'disabled=""'
  );
  expect(render()).toContain("Auto Sync Save could not be confirmed.");
  client.stop();
});
