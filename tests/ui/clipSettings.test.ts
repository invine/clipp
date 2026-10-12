import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClipSettings } from "../../packages/ui/src/ClipSettings";
import { createSettingsClient } from "../../packages/core/runtime/settingsClient";

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
