import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./electron-host.css";
import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import { useKeyboardNavigation } from "../../../packages/ui/src/useKeyboardNavigation";
import { createElectronUiRuntimeAdapter } from "./uiRuntimeAdapter";

const App = () => {
  const keyboardNavigation = useKeyboardNavigation();
  const session = useMemo(() => createUiSession(), []);
  const adapter = useMemo(
    () => createElectronUiRuntimeAdapter(window.clipp, session),
    [session]
  );
  return (
    <div
      className="electron-host"
      data-keyboard-navigation={keyboardNavigation}
    >
      <ClipboardWorkspace adapter={adapter} session={session} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
