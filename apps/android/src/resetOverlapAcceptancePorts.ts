/** Acceptance-only port decorators; never imported by the ordinary app build. */
import { registerPlugin } from "@capacitor/core";
import { createAndroidBackgroundNative as createRealBackgroundNative } from "./backgroundContinuityNative";
import {
  createAndroidIdentityResetRuntime as createRealIdentityResetRuntime,
  type AndroidIdentityResetNative,
} from "./identityResetRuntime";
import { createResetOverlapPorts } from "./resetOverlapPorts";

export { createAndroidPendingTrustRequestStore } from "./identityResetRuntime";
export const overlapPorts = createResetOverlapPorts(10000);
export const createAndroidBackgroundNative = () =>
  overlapPorts.wrapBackground(createRealBackgroundNative());
export function createAndroidIdentityResetRuntime(options: { suspend(): Promise<void> }) {
  const native = registerPlugin<AndroidIdentityResetNative>("IdentityResetStorage");
  return createRealIdentityResetRuntime({
    suspend: options.suspend,
    native: overlapPorts.wrapReset(native),
  });
}
