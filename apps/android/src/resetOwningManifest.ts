/** Immutable input for the separately opted-in native owning entry. No command vocabulary. */
export type ResetOwningExpectations = Readonly<{
  theme: "system" | "light" | "dark";
  autoSync: boolean;
  backgroundEnabled: boolean;
  localRetentionMs: number;
  sharingLifetimeMs: number;
  markers: readonly string[];
  pinnedCount: number;
}>;
type Common = Readonly<{ version: 1; caseId: string; deadlineMs: number }>;
export type ResetOwningManifest = Common &
  (
    | Readonly<{ mode: "observe-preflight" }>
    | Readonly<{
        mode: "execute";
        operationId: string;
        reviewedPeerId: string;
        expected: ResetOwningExpectations;
      }>
  );
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
function id(value: unknown, max = 128): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    !/[\s\x00-\x1f\x7f]/.test(value)
  );
}
function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}
export function parseResetOwningManifest(text: string): ResetOwningManifest {
  if (new TextEncoder().encode(text).byteLength > 8192)
    throw new Error("invalid_manifest");
  const value: unknown = JSON.parse(text);
  const commonKeys = ["version", "mode", "caseId", "deadlineMs"];
  if (
    !record(value) ||
    value.version !== 1 ||
    !id(value.caseId) ||
    !integer(value.deadlineMs, 1000, 60000)
  )
    throw new Error("invalid_manifest");
  const common = {
    version: 1 as const,
    caseId: value.caseId,
    deadlineMs: value.deadlineMs,
  };
  if (value.mode === "observe-preflight" && exact(value, commonKeys))
    return Object.freeze({ ...common, mode: value.mode });
  if (
    value.mode !== "execute" ||
    !exact(value, [
      ...commonKeys,
      "operationId",
      "reviewedPeerId",
      "expected",
    ]) ||
    !id(value.operationId, 512) ||
    !id(value.reviewedPeerId, 512)
  )
    throw new Error("invalid_manifest");
  const e = value.expected;
  if (
    !record(e) ||
    !exact(e, [
      "theme",
      "autoSync",
      "backgroundEnabled",
      "localRetentionMs",
      "sharingLifetimeMs",
      "markers",
      "pinnedCount",
    ]) ||
    (e.theme !== "system" && e.theme !== "light" && e.theme !== "dark") ||
    typeof e.autoSync !== "boolean" ||
    typeof e.backgroundEnabled !== "boolean" ||
    !integer(e.localRetentionMs, 0, 315360000000) ||
    !integer(e.sharingLifetimeMs, 1, 2592000000) ||
    !integer(e.pinnedCount, 0, 8) ||
    !Array.isArray(e.markers) ||
    e.markers.length < 1 ||
    e.markers.length > 8 ||
    !e.markers.every(
      (marker: unknown): marker is string =>
        typeof marker === "string" &&
        marker.startsWith("clipp-reset-") &&
        marker.length <= 256 &&
        !/[\x00-\x1f\x7f]/.test(marker)
    ) ||
    new Set(e.markers).size !== e.markers.length
  )
    throw new Error("invalid_manifest");
  return Object.freeze({
    ...common,
    mode: value.mode,
    operationId: value.operationId,
    reviewedPeerId: value.reviewedPeerId,
    expected: Object.freeze({
      theme: e.theme,
      autoSync: e.autoSync,
      backgroundEnabled: e.backgroundEnabled,
      localRetentionMs: e.localRetentionMs,
      sharingLifetimeMs: e.sharingLifetimeMs,
      markers: Object.freeze([...e.markers]),
      pinnedCount: e.pinnedCount,
    }),
  });
}
