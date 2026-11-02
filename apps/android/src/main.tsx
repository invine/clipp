import React from "react";
import ReactDOM from "react-dom/client";
import { AndroidApp } from "./AndroidApp";
import { createAndroidRuntime } from "./client";

const owner = createAndroidRuntime();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <AndroidApp runtime={owner} />
);
