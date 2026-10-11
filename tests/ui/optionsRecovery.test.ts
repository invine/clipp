import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OptionsRecovery } from "../../packages/ui/src/OptionsRecovery";
import { createUiSession } from "../../packages/ui/src/uiSession";
const a = {
  key: "a",
  name: "A",
  kind: "managed" as const,
  discoveryUrl: "https://a.example/v1/relay",
};
const b = { ...a, key: "b", name: "B" };
it("the real options recovery consumer includes hidden failed Pairing input, relay Save/action and preference results", async () => {
  const session = createUiSession();
  session.pairing.change("bad retained payload");
  await session.pairing.submit(async () => ({
    ok: false,
    error: "invalid_pairing_target",
  }));
  session.relay.begin(a);
  session.relay.change("name", "Retained A");
  await session.relay.save(async () => ({
    status: "rejected",
    configurations: [a, b],
    configurationApplied: false,
    credentialsRemoved: [],
    error: "disk",
  }));
  session.relay.begin(b);
  await session.relayAction("b", async () => ({
    status: "unconfirmed",
    error: "lost reply",
  }));
  session.open({ kind: "issues", origin: "issues-summary" });
  const html = renderToStaticMarkup(
    React.createElement(OptionsRecovery, {
      session,
      faults: {},
      preferenceError: "partial settings",
      onRetry: () => undefined,
      onOpenTask: () => {},
    })
  );
  expect(html).toContain("4 issues need attention");
  expect(html).toContain('data-issue-id="task:input:pairing"');
  expect(html).toContain('data-issue-id="task:a:relay-edit"');
  expect(html).toContain('data-issue-id="task:b:relay-action"');
  expect(html).toContain("Open Pairing");
  expect(session.pairing.getSnapshot().raw).toBe("bad retained payload");
});
it("options advertises an honest Pairing recovery route and presents the associated runtime recovery task", () => {
  const session = createUiSession();
  const faults = {
    pairingErrors: [
      { targetPeerId: "peer-a", code: "membership_persistence_failed" },
      { targetPeerId: "peer-a", code: "membership_persistence_failed" },
    ],
  };
  session.open({ kind: "issues", origin: "issues-summary" });
  const render = () =>
    renderToStaticMarkup(
      React.createElement(OptionsRecovery, {
        session,
        faults,
        onRetry: () => undefined,
        onOpenTask: () => {},
      })
    );
  expect(render()).toContain("Inspect Pairing recovery");
  expect(render()).not.toContain("Open Requests");
  session.open({ kind: "pairing-recovery", origin: "issues-summary" });
  expect(render()).toContain("Pairing recovery");
  expect(render()).toContain("peer-a");
  expect(render()).toContain("Retrying local membership storage automatically");
  expect(render()).not.toContain("Pairing text");
  expect(
    render().match(/Retrying local membership storage automatically/g)
  ).toHaveLength(1);
  session.back();
  expect(session.getSnapshot().tasks.at(-1)?.kind).toBe("issues");
});
