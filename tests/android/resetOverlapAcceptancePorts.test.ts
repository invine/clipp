const nativeStart = jest.fn(async (_input: { autoSync: boolean | null }) => {});
const nativeFence = jest.fn(async () => {});
const nativeUpdate = jest.fn(async (_input: unknown) => {});
jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
  registerPlugin: (name: string) =>
    name === "BackgroundContinuity"
      ? { start: nativeStart, update: nativeUpdate }
      : { acquireFence: nativeFence },
}));
import {
  overlapPorts,
  createAndroidBackgroundNative,
  createAndroidIdentityResetRuntime,
} from "../../apps/android/src/resetOverlapAcceptancePorts";

test("acceptance wrappers call real Capacitor adapters before exposing their held acknowledgements", async () => {
  const background = createAndroidBackgroundNative();
  const runtime = createAndroidIdentityResetRuntime({
    suspend: async () => {},
  });
  overlapPorts.arm();
  const start = background.start(false);
  expect(await overlapPorts.startGate.ready).toBe(true);
  expect(nativeStart).toHaveBeenCalledWith({ autoSync: false });
  const fence = runtime.lifecycle.acquireFence();
  expect(await overlapPorts.fenceGate.ready).toBe(true);
  expect(nativeFence).toHaveBeenCalledTimes(1);
  overlapPorts.fenceGate.release();
  overlapPorts.startGate.release();
  await Promise.all([start, fence]);
  const nativeRejection = new Error(
    "identity_reset_incomplete_retry_after_setup"
  );
  nativeUpdate.mockRejectedValueOnce(nativeRejection);
  await expect(background.update("waiting", 0, false)).rejects.toBe(
    nativeRejection
  );
  expect(nativeUpdate).toHaveBeenCalledWith({
    state: "waiting",
    connectedTrustedDeviceCount: 0,
    autoSync: false,
  });
  expect(overlapPorts.isPostReleaseFenceUpdateError(nativeRejection)).toBe(
    true
  );
});
