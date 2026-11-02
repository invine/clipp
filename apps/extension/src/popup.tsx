import "./acceptanceClipboardStartup";
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tailwind-built.css";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./popup-host.css";
import "./management-host.css";
import { ExtensionApp } from "./ExtensionApp";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ExtensionApp surface="popup" />
);
