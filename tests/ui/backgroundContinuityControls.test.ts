import { createUiSession } from "../../packages/ui/src/uiSession";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackgroundContinuityControls } from "../../packages/ui/src/BackgroundContinuityControls";
import type { BackgroundContinuityActionRunner } from "../../packages/ui/src/backgroundContinuityBehavior";
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
const behavior: BackgroundContinuityActionRunner = {
  state: { pendingAction: null, error: null },
  perform: async (_action, effect) => {
    await effect();
    return true;
  },
};
function render(value: BackgroundContinuityState) {
  return renderToStaticMarkup(
    React.createElement(BackgroundContinuityControls, {
      state: value,
      behavior,
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

it("keeps Background Continuity controls unavailable when the native capability is missing", () => {
  const html = render({ ...state, available: false });
  expect(html).toContain("Available on Android 12 and later.");
  expect(html).not.toContain("Enable background mode");
  expect(html).not.toContain("Start background mode");
  expect(html).not.toContain("Stop background mode");
});

it.each(["unconfirmed", "partial"] as const)(
  "keeps Pause/Resume unavailable after actual session %s feedback until a confirmed refresh",
  async (status) => {
    const session = createUiSession();
    let applied = true;
    const desiredAction = () =>
      session.saveAutoSync(async () => {
        applied = false;
        return { status: "applied", autoSync: false };
      });
    const confirmedRefresh = () => session.refreshAutoSync(async () => true);
    const view = () =>
      renderToStaticMarkup(
        React.createElement(BackgroundContinuityControls, {
          state: { ...state, autoSync: applied },
          behavior,
          autoSyncRecoveryRequired:
            session.getSnapshot().autoSync.recoveryRequired,
          setEnabled: async () => undefined,
          setAutoSync: desiredAction,
          refresh: async () => undefined,
          refreshAutoSync: confirmedRefresh,
          help: () => undefined,
        })
      );
    const button = (html: string, label: string) =>
      html.match(new RegExp(`<button[^>]*>\\s*${label}\\s*</button>`))?.[0];
    await session.saveAutoSync(async () => ({
      status,
      autoSync: true,
      error: "lost_reply",
    }));
    const recovery = view();
    expect(button(recovery, "Pause Auto Sync")).toContain('disabled=""');
    expect(button(recovery, "Stop background mode")).not.toContain(
      'disabled=""'
    );
    expect(button(recovery, "Refresh background state")).not.toContain(
      'disabled=""'
    );
    await desiredAction();
    expect(applied).toBe(true);
    expect(button(recovery, "Refresh Auto Sync")).not.toContain('disabled=""');
    await confirmedRefresh();
    expect(button(view(), "Pause Auto Sync")).not.toContain('disabled=""');
    await desiredAction();
    expect(applied).toBe(false);
    expect(button(view(), "Resume Auto Sync")).not.toContain('disabled=""');
  }
);
