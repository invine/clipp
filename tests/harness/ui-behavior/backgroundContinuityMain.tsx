import React from "react";
import { createRoot } from "react-dom/client";
import { BackgroundContinuityScenario } from "./backgroundContinuityScenario";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";

createRoot(document.getElementById("root")!).render(
  <BackgroundContinuityScenario />
);
