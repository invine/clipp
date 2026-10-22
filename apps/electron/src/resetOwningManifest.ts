/** Input for the separately selected main-process owning acceptance entry. */
type Common = Readonly<{
  version: 1;
  caseId: string;
  deadlineUnixMs: number;
}>;
export type ElectronResetOwningManifest = Common &
  (
    | Readonly<{ mode: "observe-preflight" }>
    | Readonly<{
        mode: "execute" | "observe-replay";
        operationId: string;
        reviewedPeerId: string;
        expected: Readonly<{
          autoSync: boolean;
          localRetentionMs: number;
          markers: readonly string[];
          nextMarker: string;
          pinnedCount: number;
          configurationSha256: string;
        }>;
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
function marker(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("clipp-reset-") &&
    value.length <= 256 &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
export function parseElectronResetOwningManifest(
  text: string,
  now = Date.now()
): ElectronResetOwningManifest {
  if (Buffer.byteLength(text, "utf8") > 8192)
    throw new Error("invalid_manifest");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("invalid_manifest");
  }
  const commonKeys = ["version", "mode", "caseId", "deadlineUnixMs"];
  if (
    !record(value) ||
    value.version !== 1 ||
    !id(value.caseId) ||
    !integer(value.deadlineUnixMs, now + 1, now + 600000)
  )
    throw new Error("invalid_manifest");
  const common = {
    version: 1 as const,
    caseId: value.caseId,
    deadlineUnixMs: value.deadlineUnixMs,
  };
  if (value.mode === "observe-preflight" && exact(value, commonKeys)) {
    return Object.freeze({ ...common, mode: value.mode });
  }
  if (
    (value.mode !== "execute" && value.mode !== "observe-replay") ||
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
      "autoSync",
      "localRetentionMs",
      "markers",
      "nextMarker",
      "pinnedCount",
      "configurationSha256",
    ]) ||
    typeof e.autoSync !== "boolean" ||
    !integer(e.localRetentionMs, 0, 315360000000) ||
    !integer(e.pinnedCount, 0, 8) ||
    typeof e.configurationSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(e.configurationSha256) ||
    !Array.isArray(e.markers) ||
    e.markers.length < 1 ||
    e.markers.length > 8 ||
    !e.markers.every(marker) ||
    new Set(e.markers).size !== e.markers.length ||
    !marker(e.nextMarker) ||
    e.markers.includes(e.nextMarker)
  )
    throw new Error("invalid_manifest");
  return Object.freeze({
    ...common,
    mode: value.mode,
    operationId: value.operationId,
    reviewedPeerId: value.reviewedPeerId,
    expected: Object.freeze({
      autoSync: e.autoSync,
      localRetentionMs: e.localRetentionMs,
      markers: Object.freeze([...e.markers]),
      nextMarker: e.nextMarker,
      pinnedCount: e.pinnedCount,
      configurationSha256: e.configurationSha256,
    }),
  });
}
