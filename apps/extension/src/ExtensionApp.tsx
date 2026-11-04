import React, { useMemo, useState, useSyncExternalStore } from "react";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import { QRScanner } from "./components/QRScanner";
import { ManagementNavigationView } from "./ManagementNavigation";
import { createExtensionBrowserUiAdapter } from "./uiRuntimeAdapter";

export function ExtensionApp({ surface }: { surface: "popup" | "page" }) {
  const [session] = useState(createUiSession);
  const adapter = useMemo(
    () => createExtensionBrowserUiAdapter(surface, session),
    [surface, session]
  );
  const state = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot
  );
  return (
    <div
      style={{ width: "100%", height: "100%" }}
      className={surface === "popup" ? "popup-host" : "options-host"}
    >
      <ManagementNavigationView
        consumer={adapter.navigation}
        surface={surface}
      />
      <ClipboardWorkspace
        adapter={adapter}
        session={session}
        pairingImport={
          <QRScanner
            session={session}
            disabled={
              !state.identity ||
              !!state.runtimeError ||
              state.identityRotationRecovery
            }
            onScan={adapter.importPairing}
          />
        }
      />
    </div>
  );
}
