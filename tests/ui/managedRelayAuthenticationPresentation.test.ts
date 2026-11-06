import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagedRelaySettings } from "../../packages/ui/src/ManagedRelaySettings";
import type { RelayState } from "../../packages/core/network/managedRelays";

const configuration = {
  key: "managed",
  name: "Clipp relay",
  kind: "managed" as const,
  discoveryUrl: "https://relay.example.test",
};

function render(status: RelayState["status"]) {
  const state: RelayState = {
    key: configuration.key,
    name: configuration.name,
    kind: "managed",
    status,
  };
  return renderToStaticMarkup(
    React.createElement(ManagedRelaySettings, {
      configurations: [configuration],
      states: [state],
      onMutate: async () => {
        throw new Error("unused by this presentation test");
      },
      onLogin: async () => ({ status: "authenticated" as const }),
      onManageAccount: async () => ({ status: "portal-opened" as const }),
    })
  );
}

it("shows Log in only while Clipp authentication is required", () => {
  expect(render("login_needed")).toContain(">Log in</button>");
  expect(render("ready")).not.toContain(">Log in</button>");
  expect(render("degraded")).not.toContain(">Log in</button>");
  expect(render("retrying")).not.toContain(">Log in</button>");
});
