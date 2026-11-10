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
        <button onClick={() => setOwner({})}>Replace runtime owner</button>
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
        {...(managed
          ? {
              managedRelayConfigurations: [
                {
                  key: "relay-a",
                  name: "Relay A",
                  kind: "managed" as const,
                  discoveryUrl: "https://relay.example/v1/relay",
                },
              ],
              managedRelayStates: [
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
