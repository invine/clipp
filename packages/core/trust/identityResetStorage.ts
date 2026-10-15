import {
  IDENTITY_ROTATION_NOTICE_KEY,
  IDENTITY_ROTATION_SCOPED_STORAGE_KEYS,
} from "./identityRotation";
import type { IdentityResetPorts } from "./manualIdentityReset";

/** Required host admission and drain barriers, supplied by the runtime owner. */
export type IdentityResetLifecycle = Pick<
  IdentityResetPorts,
  "acquireFence" | "quiesce"
>;

/** Installation settings and relay credentials deliberately have no entry here. */
export const IDENTITY_RESET_SCOPED_STORAGE_KEYS = [
  ...IDENTITY_ROTATION_SCOPED_STORAGE_KEYS,
  IDENTITY_ROTATION_NOTICE_KEY,
] as const;

export function identityResetStorageKeys(
  identityKey: string
): readonly string[] {
  return [
    ...IDENTITY_RESET_SCOPED_STORAGE_KEYS,
    identityKey,
    `${identityKey}:initializationError`,
  ];
}
