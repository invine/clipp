let mockPermission: unknown = "granted";
jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
  registerPlugin: () => ({
    getCameraPermission: async () => {
      if (mockPermission instanceof Error) throw mockPermission;
      return { state: mockPermission };
    },
  }),
}));
import { createAndroidBackgroundNative } from "../../apps/android/src/backgroundContinuityNative";

it.each(["granted", "denied", "unknown"] as const)(
  "passively reports the OS %s camera permission state",
  async (state) => {
    mockPermission = state;
    expect(await createAndroidBackgroundNative().cameraPermission!()).toBe(
      state
    );
  }
);
it.each(["unrecognized", null, new Error("native service unavailable")])(
  "an unavailable/malformed native camera check stays unknown",
  async (state) => {
    mockPermission = state;
    expect(await createAndroidBackgroundNative().cameraPermission!()).toBe(
      "unknown"
    );
  }
);
