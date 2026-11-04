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
import { createHostTaskInput } from "../../packages/ui/src/hostTaskInput";
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
  expect(output).toContain('<h1 class="workspace-current-title">Requests</h1>');
  expect(output).toContain('<h2 class="device-section-title"');
  expect(output).toContain("Pending requests</h2>");
  expect(output).not.toContain('aria-label="Search history"');
  expect(output).not.toContain("No pending requests.");
});
it("an active History query has a named clear route", () => {
  const session = createUiSession();
  session.update({ search: "needle", filterMode: "pinned" });
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, session })
  );
  expect(output).toContain('aria-label="Clear search"');
  expect(output).toContain('<h1 class="workspace-current-title">Pinned</h1>');
});
it("keeps History controls off task destinations while retaining a screen heading", () => {
  const session = createUiSession();
  session.update({ destination: "settings" });
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, session })
  );
  expect(output).toContain('<h1 class="workspace-current-title">Settings</h1>');
  expect(output).not.toContain('aria-label="Search history"');
  expect(output).not.toContain("Filters</button>");
  expect(output).not.toContain("Share current clipboard now");
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
        },
        onSaveAppearanceSettings: async (patch) => {
          await client.save(patch);
        },
        onRefreshAppearanceSettings: () => client.refresh(),
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
  expect(render().match(/<button[^>]*id="auto-sync"[^>]*>/)?.[0]).toContain(
    'disabled=""'
  );
  await client.start();
  const saving = session.saveAutoSync(async () => {
    await client.save({ autoSync: false });
  });
  for (const html of [render(), render(false)]) {
    const select = html.match(/<button[^>]*id="auto-sync"[^>]*>/)?.[0];
    expect(select).toContain('aria-disabled="true"');
    expect(select).toContain('aria-busy="true"');
    expect(select).not.toContain('disabled=""');
    expect(select).toContain('aria-checked="true"');
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
  expect(render().match(/<button[^>]*id="auto-sync"[^>]*>/)?.[0]).toContain(
    'aria-checked="false"'
  );
  expect(render()).toContain("Auto Sync saved.");
  await session.saveAutoSync(async () => ({
    status: "unconfirmed",
    autoSync: false,
    error: "reply_lost",
  }));
  expect(render().match(/<button[^>]*id="auto-sync"[^>]*>/)?.[0]).toContain(
    'disabled=""'
  );
  expect(render()).toContain("Auto Sync Save could not be confirmed.");
  client.stop();
});

it("renders the real workspace and retains nested Pairing draft without Array.at", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "at")!;
  Object.defineProperty(Array.prototype, "at", {
    value: undefined,
    configurable: true,
  });
  try {
    const session = createUiSession();
    const render = () =>
      renderToStaticMarkup(
        React.createElement(ClipboardApp, { ...props, session })
      );
    expect(render()).toContain('aria-label="Clipp destinations"');
    session.open({ kind: "pairing", origin: "pairing-start" });
    session.open({ kind: "paste", origin: "pairing-paste" });
    session.pairing.change("retained native compatibility draft");
    const input = createHostTaskInput(session);
    input.setReady(true);
    expect(await input.back({ sequence: 1, imeVisible: false })).toBe("task");
    expect(session.getSnapshot().tasks.map((task) => task.kind)).toEqual([
      "pairing",
    ]);
    expect(await input.back({ sequence: 2, imeVisible: false })).toBe("task");
    expect(session.getSnapshot().tasks).toEqual([]);
    expect(session.pairing.getSnapshot().raw).toBe(
      "retained native compatibility draft"
    );
    expect(render()).toContain('aria-label="Clipp destinations"');
    input.dispose();
  } finally {
    Object.defineProperty(Array.prototype, "at", descriptor);
  }
});

it("notification Requests rendering offers a return route while the originating Pairing draft is retained", () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.pairing.change("retained input");
  session.acceptDestination(
    "notification-1",
    { kind: "requests", entity: "expired" },
    { ready: true, clipIds: [], requestIds: [] },
    "notification"
  );
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props, session })
  );
  expect(output).toContain("Back to previous task");
  expect(output).toContain(
    "This Request is no longer available. Open Requests."
  );
  expect(output).toContain("Pending requests");
  expect(session.pairing.getSnapshot().raw).toBe("retained input");
});

it("Settings exposes separate blocked request-channel recovery without pretending permission is Pairing success", () => {
  const session = createUiSession();
  session.update({ destination: "settings" });
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, {
      ...props,
      session,
      notificationControls: {
        state: { app: "available", channel: "blocked", displayError: null },
        pending: false,
        error: false,
        refresh: async () => undefined,
        openSettings: async () => undefined,
      },
    })
  );
  expect(output).toContain("App notifications: Allowed");
  expect(output).toContain("Request channel: Blocked");
  expect(output).toContain("Open notification settings");
  expect(output).toContain("Refresh notification availability");
});

it("a distinct notification removes the rendered Issues modal from Requests and Back restores it", () => {
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.pairing.change("retained original input");
  const authority = { ready: true, clipIds: [], requestIds: [] };
  session.acceptDestination(
    "selection-a",
    { kind: "requests" },
    authority,
    "notification"
  );
  session.open({ kind: "issues", origin: "issues-summary" });
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ClipboardApp, { ...props, session })
    );
  expect(render()).toContain('aria-modal="true"');
  session.acceptDestination(
    "selection-b",
    { kind: "requests" },
    authority,
    "notification"
  );
  expect(render()).toContain("Pending requests");
  expect(render()).not.toContain('aria-modal="true"');
  expect(render()).toContain("Back to previous task");
  session.back();
  expect(render()).toContain('aria-modal="true"');
  expect(render()).toContain("Issues and recovery");
  session.back();
  session.back();
  expect(session.getSnapshot().tasks.at(-1)?.kind).toBe("pairing");
  expect(session.pairing.getSnapshot().raw).toBe("retained original input");
});

it("History exposes the Clip content as details selection and keeps complete graphemes in its preview", () => {
  const content = "a".repeat(219) + "👩🏽‍💻" + " ending";
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, {
      ...props,
      clips: [
        {
          id: "unicode",
          type: "text",
          content,
          originPeerId: "local",
          capturedAt: 1,
          shareExpiresAt: 2,
        },
      ],
    })
  );
  expect(output).toContain('aria-label="View Clip details"');
  expect(output).toContain("a".repeat(219) + "👩🏽‍💻…");
  expect(output).not.toContain('aria-label="More Clip actions"');
  expect(output).toContain('aria-label="Copy Clip"');
  expect(output).toContain('aria-label="Pin Clip"');
});

it.each(["e\u0301", "👍🏽", "🇦🇪"])(
  "History preview preserves the final %s grapheme",
  (grapheme) => {
    const output = renderToStaticMarkup(
      React.createElement(ClipboardApp, {
        ...props,
        clips: [
          {
            id: "unicode",
            type: "text",
            content: "a".repeat(219) + grapheme + " tail",
            originPeerId: "local",
            capturedAt: 1,
            shareExpiresAt: 2,
          },
        ],
      })
    );
    expect(output).toContain("a".repeat(219) + grapheme + "…");
  }
);

it("names one connection control without claiming delivery for an untrusted transport peer", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, {
      ...props,
      peers: ["pairing-only"],
      connectionStateKnown: true,
    })
  );
  expect(output).toContain('aria-label="Open Devices: No Trusted Devices yet"');
  expect(output).not.toContain("Synced");
});

it("connection control is a direct navigation action", () => {
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, { ...props })
  );
  const control = output.match(
    /<button[^>]*data-session-focus="connections-summary"[^>]*>/
  )?.[0];
  expect(control).toContain('aria-label="Open Devices:');
  expect(control).not.toContain("aria-haspopup");
});

it("Devices retains honest text status when a reported path is no longer connected", () => {
  const session = createUiSession();
  session.update({ destination: "devices" });
  const render = (peers: string[], connectionStateKnown: boolean) =>
    renderToStaticMarkup(
      React.createElement(ClipboardApp, {
        ...props,
        session,
        devices: [{ deviceId: "trusted", deviceName: "Laptop" }],
        peers,
        connectionStateKnown,
        peerConnections: [
          {
            peerId: "trusted",
            path: "direct",
            hasDirect: true,
            hasRelay: false,
            addrs: [],
          },
        ],
      })
    );
  expect(render(["trusted"], true)).toContain("Connected · direct");
  expect(render([], true)).not.toContain("Connected · direct");
  expect(render([], true)).toContain("Offline");
  expect(render([], false)).toContain("Connection status unknown");
});

it("Devices distinguishes this installation from trusted devices when one is offline", () => {
  const session = createUiSession();
  session.update({ destination: "devices" });
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, {
      ...props,
      session,
      identity: { deviceId: "local", deviceName: "This computer" },
      devices: [{ deviceId: "trusted", deviceName: "Work laptop" }],
      connectionStateKnown: true,
      peers: [],
    })
  );

  expect(output).toContain("This device");
  expect(output).toContain("Trusted Devices");
  expect(output).toContain("Work laptop");
  expect(output).toContain("Trusted · Offline");
  expect(output).not.toContain("Last seen");
  expect(output).toContain("Pair this device");

  const emptyOutput = renderToStaticMarkup(
    React.createElement(ClipboardApp, {
      ...props,
      session,
      identity: { deviceId: "local", deviceName: "This computer" },
      devices: [],
      connectionStateKnown: true,
      peers: [],
    })
  );
  expect(emptyOutput).toContain("No Trusted Devices yet.");
  expect(emptyOutput).toContain("0 devices");
});

it("organizes routine settings, connections, and advanced tasks by session category", () => {
  const session = createUiSession();
  session.update({ destination: "settings" });
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ClipboardApp, {
        ...props,
        session,
        onSetAutoSync: async () => ({
          status: "applied" as const,
          autoSync: true,
        }),
        onSetLocalRetention: async () => {},
        onMutateManagedRelay: async () => ({
          status: "applied" as const,
          configurations: [],
          configurationApplied: true,
          credentialsRemoved: [],
        }),
      })
    );
  const general = render();
  expect(general).toContain('aria-label="Settings categories"');
  expect(general).toMatch(/aria-current="location"[^>]*>General/);
  expect(general).toContain('data-settings-panel="general"');
  expect(general).toContain('data-settings-panel="connections"');
  expect(general).toContain('data-settings-panel="advanced"');
  session.update({ settingsCategory: "advanced" });
  const advanced = render();
  expect(advanced).toMatch(/aria-current="location"[^>]*>Advanced/);
  expect(advanced).toContain('data-settings-panel="advanced"');
  expect(advanced).toContain('data-session-focus="settings-clear"');
  expect(advanced).not.toContain("Generate new identity");
});

it("explains real settings groups and keeps history and sharing policies distinct", async () => {
  const session = createUiSession();
  session.update({ destination: "settings" });
  const snapshot = {
    sessionId: "settings",
    revision: 1,
    state: {
      theme: "system" as const,
      autoSync: true,
      logLevel: "info" as const,
      localRetentionMs: 30 * 86400000,
      sharingLifetimeMs: 86400000,
    },
  };
  const client = createSettingsClient({
    send: async () => ({ ok: true, snapshot }),
    subscribe: () => () => {},
  });
  await client.start();
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, {
      ...props,
      session,
      appearanceSettings: {
        ...client.getState(),
      },
      autoSyncKnown: true,
      autoSync: true,
      onSetAutoSync: async () => ({
        status: "applied" as const,
        autoSync: true,
      }),
    })
  );

  expect(output).toContain("Choose how this device works with Clipp.");
  expect(output).toContain("Send and receive Clips with Trusted Devices.");
  expect(output).toContain("Clipboard History");
  expect(output).toContain("Clip Sharing Lifetime");
  expect(output).toContain("Pins are exempt.");
  expect(output).toContain(
    "Expiry stops sharing; it does not delete local history."
  );
  expect(output).toContain("Clear all local history");
  client.stop();
});

it("exposes compact navigation with a truthful expanded state", () => {
  const session = createUiSession();
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ClipboardApp, { ...props, session })
    );

  expect(render()).toContain('aria-label="Open navigation"');
  expect(render()).toContain('aria-expanded="false"');
  expect(render()).toContain('aria-controls="workspace-navigation"');

  session.update({ showNav: true });
  expect(render()).toContain('aria-label="Close navigation"');
  expect(render()).toContain('aria-expanded="true"');
});

it("Links shows URL Clips from authoritative History state", () => {
  const session = createUiSession();
  session.update({ destination: "history", filterMode: "links" });
  const output = renderToStaticMarkup(
    React.createElement(ClipboardApp, {
      ...props,
      session,
      clips: [
        {
          id: "text-clip",
          type: "text",
          content: "A text Clip",
          originPeerId: "local",
          capturedAt: 2,
          shareExpiresAt: 3,
        },
        {
          id: "url-clip",
          type: "url",
          content: "https://example.test/article",
          originPeerId: "remote",
          capturedAt: 1,
          shareExpiresAt: 4,
        },
      ],
    })
  );

  expect(output).toContain("https://example.test/article");
  expect(output).not.toContain("A text Clip");
  expect(output).toMatch(
    /aria-current="page"[^>]*>\s*<svg[^>]*>[\s\S]*?<\/svg><span>Links<\/span>/
  );
});
