import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ClipboardApp } from "../../../packages/ui/src/ClipboardApp";
import { parseUiDestination } from "../../../packages/ui/src/uiDestination";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { RelayActionResult } from "../../../packages/core/network/relayActions";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";

let resolveLogin: ((result: RelayActionResult) => void) | undefined;
const managed = new URLSearchParams(location.search).has("managed");
const summary = new URLSearchParams(location.search).has("summary");
const longIdentity = new URLSearchParams(location.search).has("long");
let resolveSave: ((value?: string[]) => void) | undefined;
let rejectSave: ((reason: Error) => void) | undefined;
const session = createUiSession();
session.update({ destination: "relays" });
const props: ClipboardAppProps = {
  clips: [],
  devices: [],
  pending: [],
  peers: [],
  identity: { deviceId: "relay-owner-a", deviceName: "Test" },
  pinnedIds: [],
  session,
  onDeleteClip: () => {},
  onUnpair: () => {},
  onAccept: async () => ({ ok: true, admitted: true }),
  onReject: async () => ({ ok: true, admitted: false }),
  onPairText: async () => ({ ok: false, error: "invalid" }),
  onRequestPairingCode: async () => null,
  onCopyPairingText: async () => ({ status: "copied" }),
  onReuseClip: () => "complete",
  onSetPinned: () => {},
  onClearAll: () => {},
  relayAddresses: [],
  onSetRelayAddresses: async () =>
    new Promise((resolve, reject) => {
      resolveSave = resolve;
      rejectSave = reject;
    }),
};
function Scenario() {
  const [owner, setOwner] = useState<object>({});
  const [changed, setChanged] = useState(false);
  const [effects, setEffects] = useState<string[]>([]);
  return (
    <>
      <div className="ui-scenario-controls" data-task-scenario-controls>
        <button
          onClick={() =>
            session.acceptDestination(
              "notification",
              { kind: "requests" },
              { ready: true, clipIds: [], requestIds: [] },
              "notification"
            )
          }
        >
          Open Requests notification
        </button>
        <button
          onClick={() =>
            resolveLogin?.({
              status: "unconfirmed",
              error: "Login could not be confirmed",
            })
          }
        >
          Reject relay login
        </button>
        <output data-testid="relay-workspace-effects">
          {effects.join(",")}
        </output>
        <button onClick={() => setOwner({})}>Replace runtime owner</button>
        <button onClick={() => setChanged(true)}>
          Update relay observations
        </button>
        <button
          onClick={() => {
            const destination = parseUiDestination({
              kind: "settings",
              category: "relays",
            });
            if (destination)
              session.acceptDestination("legacy-relays", destination, {
                ready: true,
                clipIds: [],
                requestIds: [],
              });
          }}
        >
          Open legacy relay handoff
        </button>
        <button onClick={() => resolveSave?.()}>Resolve old save</button>
        <button onClick={() => rejectSave?.(new Error("old failure"))}>
          Reject old save
        </button>
      </div>
      <ClipboardApp
        {...props}
        runtimeOwner={owner}
        {...(!managed && summary
          ? {
              relayAddresses: [
                "/dns4/a/tcp/1",
                "/dns4/b/tcp/2",
                "/dns4/c/tcp/3",
              ],
              relayConnections: [
                {
                  address: "/dns4/a/tcp/1",
                  addrs: [],
                  peerId: "a",
                  status: "connected" as const,
                },
                {
                  address: "/dns4/b/tcp/2",
                  addrs: [],
                  peerId: "b",
                  status: changed
                    ? ("connected" as const)
                    : ("disconnected" as const),
                },
              ],
            }
          : {})}
        {...(managed
          ? {
              managedRelayConfigurations: [
                ...(summary
                  ? ["b", "c", "d"].map((key) => ({
                      key,
                      name: `Relay ${key}`,
                      kind: "managed" as const,
                      discoveryUrl: `https://${key}.example/relay`,
                    }))
                  : []),
                {
                  key: "relay-a",
                  name: longIdentity
                    ? "Long relay name identifying the correct office and device across a narrow screen"
                    : "Relay A",
                  kind: "managed" as const,
                  discoveryUrl: longIdentity
                    ? "https://long-relay-identity.example.com/very/long/path/that/must/remain/visible/to/the/user/for/identification"
                    : "https://relay.example/v1/relay",
                },
              ],
              managedRelayStates: [
                ...(summary
                  ? [
                      {
                        key: "b",
                        name: "Relay b",
                        kind: "managed" as const,
                        status: "ready" as const,
                      },
                      {
                        key: "c",
                        name: "Relay c",
                        kind: "managed" as const,
                        status: changed
                          ? ("ready" as const)
                          : ("connecting" as const),
                      },
                    ]
                  : []),
                {
                  key: "relay-a",
                  name: "Relay A",
                  kind: "managed" as const,
                  status: "login_needed" as const,
                },
              ],
              onMutateManagedRelay: async () => ({
                status: "rejected" as const,
                configurations: [],
                configurationApplied: false,
                credentialsRemoved: [],
                error: "Rejected",
              }),
              onManagedRelayAccount: async (key: string) => {
                setEffects((previous) => [...previous, `account:${key}`]);
                return { status: "portal-opened" as const };
              },
              onManagedRelayLogin: async () =>
                new Promise<RelayActionResult>((resolve) => {
                  resolveLogin = resolve;
                }),
            }
          : {})}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Scenario />);
