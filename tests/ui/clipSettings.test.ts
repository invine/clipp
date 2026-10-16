import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClipSettings } from "../../packages/ui/src/ClipSettings";
import { Appearance } from "../../packages/ui/src/Appearance";
import { createSettingsClient } from "../../packages/core/runtime/settingsClient";
import type { RuntimeSettings } from "../../packages/core/runtime/settingsAuthority";

it.each([
  ["Appearance", { theme: "dark" }],
  ["Keep unpinned history", { localRetentionMs: 0 }],
  ["Clip Sharing Lifetime", { sharingLifetimeMs: 3600000 }],
] satisfies Array<[string, Partial<RuntimeSettings>]>)(
  "%s stays focus eligible while saving without accepting another write",
  async (label, patch) => {
    const initial = {
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
    let finish!: (value: unknown) => void;
    const writes: Array<Partial<RuntimeSettings> | undefined> = [];
    const client = createSettingsClient({
      send: async (message) => {
        if (message.type === "getSettings")
          return { ok: true, snapshot: initial };
        writes.push(message.settings);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      subscribe: () => () => {},
    });
    const render = () => {
      const settings = {
        ...client.getState(),
        save: client.save,
        refresh: client.refresh,
      };
      return renderToStaticMarkup(
        label === "Appearance"
          ? React.createElement(Appearance, { settings })
          : React.createElement(ClipSettings, { settings })
      );
    };
    await client.start();
    const saving = client.save(patch);
    // Rendered consumer semantics only; real native focus is qualified separately.
    const busy = render();
    const select = busy.match(
      new RegExp(`<select[^>]*aria-label="${label}"[^>]*>`)
    )?.[0];
    expect(select).toBeDefined();
    expect(select).not.toContain(' disabled=""');
    expect(select).toContain('aria-disabled="true"');
    expect(select).toContain('aria-busy="true"');
    expect(busy).toContain(
      label === "Appearance" ? "Saving appearance…" : "Saving Clip settings…"
    );
    expect(await client.save(patch)).toMatchObject({
      status: "unconfirmed",
    });
    expect(writes).toEqual([patch]);
    expect(client.getState().snapshot).toEqual(initial);
    finish({
      status: "applied",
      snapshot: {
        ...initial,
        revision: 2,
        state: { ...initial.state, ...patch },
      },
    });
    await saving;
    const saved = render();
    expect(saved).not.toContain('aria-disabled="true"');
    expect(saved).not.toContain('aria-busy="true"');
    expect(saved).toContain("saved.");
    expect(client.getState().snapshot?.state).toEqual({
      ...initial.state,
      ...patch,
    });
    client.stop();
  }
);

it("represents applied nonpreset values and immediate zero semantics without replacing them with a preset", async () => {
  const client = createSettingsClient({
    send: async () => ({
      ok: true,
      snapshot: {
        sessionId: "settings",
        revision: 1,
        state: {
          theme: "system",
          autoSync: true,
          logLevel: "info",
          localRetentionMs: 1250.5,
          sharingLifetimeMs: 5001,
        },
      },
    }),
    subscribe: () => () => {},
  });
  await client.start();
  const html = renderToStaticMarkup(
    React.createElement(ClipSettings, {
      settings: {
        ...client.getState(),
        save: client.save,
        refresh: client.refresh,
      },
    })
  );
  expect(html).toContain('value="1250.5" selected=""');
  expect(html).toContain("Custom (1250.5 ms)");
  expect(html).toContain('value="5001" selected=""');
  expect(html).toContain("Remove unpinned history immediately");
  expect(html).toContain("does not delete local history");
  client.stop();
});

it("does not present a guessed applied preference while the runtime is unavailable", () => {
  const client = createSettingsClient({
    send: async () => {
      throw new Error("bridge_unavailable");
    },
    subscribe: () => () => {},
  });
  const html = renderToStaticMarkup(
    React.createElement(ClipSettings, {
      settings: {
        ...client.getState(),
        save: client.save,
        refresh: client.refresh,
      },
    })
  );
  expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html.match(/Unknown/g)).toHaveLength(2);
});
