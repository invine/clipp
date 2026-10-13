import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackgroundContinuityControls } from "../../packages/ui/src/BackgroundContinuityControls";
import type { BackgroundContinuityState } from "../../packages/ui/src/types";

const state: BackgroundContinuityState = {
  available: true,
  backgroundEnabled: true,
  service: "running",
  connection: "disconnected",
  connectedTrustedDeviceCount: 0,
  notificationAvailability: "blocked",
  autoSync: false,
  controlStateKnown: true,
  controlPending: false,
  controlError: null,
  observedBackgroundFailureCount: 0,
  supportState: "unqualified",
  batteryOptimizationGuidance: false,
};
function render(value: BackgroundContinuityState) {
  return renderToStaticMarkup(
    React.createElement(BackgroundContinuityControls, {
      state: value,
      setEnabled: async () => undefined,
      setAutoSync: async () => undefined,
      refresh: async () => undefined,
      help: () => undefined,
      openNotificationSettings: async () => undefined,
    })
  );
}
it("offers only Resume for applied Auto Sync off, with a separate Stop and denial recovery", () => {
  const html = render(state);
  expect(html).toContain("Resume Auto Sync");
  expect(html).not.toContain("Pause Auto Sync");
  expect(html).toContain("Stop background mode");
  expect(html).toContain("Notification settings");
  expect(html).toContain("Notifications are blocked");
});
it("offers only Pause for applied Auto Sync on even while disconnected", () => {
  const html = render({ ...state, autoSync: true });
  expect(html).toContain("Pause Auto Sync");
  expect(html).not.toContain("Resume Auto Sync");
});
it("withholds Auto Sync actions while state is unknown and offers refresh", () => {
  const html = render({ ...state, controlStateKnown: false });
  expect(html).not.toContain("Pause Auto Sync");
  expect(html).not.toContain("Resume Auto Sync");
  expect(html).toContain("Refresh background state");
});
it("keeps disabled and stopped background mode distinct without claiming active continuity", () => {
  expect(
    render({ ...state, backgroundEnabled: false, service: "stopped" })
  ).toContain("Enable background mode");
  const stopped = render({ ...state, service: "stopped" });
  expect(stopped).toContain("Start background mode");
  expect(stopped).not.toContain("Resume Auto Sync");
  expect(stopped).toContain("Stop background mode");
});
