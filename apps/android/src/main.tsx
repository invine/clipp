import React from "react";
import ReactDOM from "react-dom/client";
import { AndroidApp } from "./AndroidApp";
import { createAndroidRuntime } from "./client";

const owner = createAndroidRuntime();
const runtime = { client: owner.client, start: owner.start, stop: owner.stop };
ReactDOM.createRoot(document.getElementById("root")!).render(
  <AndroidApp runtime={runtime} />
);
