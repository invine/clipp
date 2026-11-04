import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./electron-host.css";
import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import { createElectronUiRuntimeAdapter } from "./uiRuntimeAdapter";

const App = () => {
  const session = useMemo(() => createUiSession(), []);
  const adapter = useMemo(
    () => createElectronUiRuntimeAdapter(window.clipp, session),
    [session]
  );
  return (
    <div className="electron-host">
      <ClipboardWorkspace adapter={adapter} session={session} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
