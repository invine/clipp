import React, { useMemo, useState, useSyncExternalStore } from "react";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import { useKeyboardNavigation } from "../../../packages/ui/src/useKeyboardNavigation";
import { QRScanner } from "./components/QRScanner";
import {
  ManagementExpandControl,
  ManagementNavigationView,
} from "./ManagementNavigation";
import { createExtensionBrowserUiAdapter } from "./uiRuntimeAdapter";

export function ExtensionApp({ surface }: { surface: "popup" | "page" }) {
  const keyboardNavigation = useKeyboardNavigation();
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
      data-keyboard-navigation={keyboardNavigation}
    >
      <ManagementNavigationView consumer={adapter.navigation} />
      <ClipboardWorkspace
        adapter={adapter}
        session={session}
        headerActions={
          surface === "popup" ? (
            <ManagementExpandControl consumer={adapter.navigation} />
          ) : undefined
        }
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
