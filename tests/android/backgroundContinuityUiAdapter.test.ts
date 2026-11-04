import { createAndroidUiRuntimeAdapter } from "../../apps/android/src/uiRuntimeAdapter";
import { createUiSession } from "../../packages/ui/src/uiSession";

it("routes Background Continuity controls through the Android client bridge", async () => {
  const client = {
    setBackgroundContinuity: jest.fn(async () => undefined),
    refreshBackgroundContinuity: jest.fn(async () => ({
      backgroundEnabled: true,
    })),
    openBackgroundNotificationSettings: jest.fn(async () => undefined),
    exportBackgroundContinuityDiagnostics: jest.fn(async () => undefined),
  };
  const runtime = {
    client,
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    identityReset: {},
  } as unknown as Parameters<typeof createAndroidUiRuntimeAdapter>[0];
  const scanner = {
    permission: undefined,
    scan: jest.fn(async () => ({ status: "cancelled" })),
  } as unknown as Parameters<typeof createAndroidUiRuntimeAdapter>[3];
  const adapter = createAndroidUiRuntimeAdapter(
    runtime,
    createUiSession(),
    {} as Parameters<typeof createAndroidUiRuntimeAdapter>[2],
    scanner
  );

  await adapter.actions.onSetBackgroundContinuity?.(true);
  await adapter.actions.onRefreshBackgroundContinuity?.();
  await adapter.actions.onOpenBackgroundNotificationSettings?.();
  await adapter.actions.onExportBackgroundContinuityDiagnostics?.();

  expect(client.setBackgroundContinuity).toHaveBeenCalledWith(true);
  expect(client.refreshBackgroundContinuity).toHaveBeenCalledTimes(1);
  expect(client.openBackgroundNotificationSettings).toHaveBeenCalledTimes(1);
  expect(client.exportBackgroundContinuityDiagnostics).toHaveBeenCalledTimes(1);
});
