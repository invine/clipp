/** Packaged root DATA only. It is never read by the normal extension worker. */
type Common = Readonly<{
  version: 1;
  caseId: string;
  extensionId: string;
  deadlineUnixMs: number;
  markers: readonly string[];
  nextMarker: string;
  expectedDeviceName: string;
}>;
export type ChromeResetOwningCase = Common &
  (
    | Readonly<{ mode: "observe-preflight" }>
    | Readonly<{
        mode: "execute" | "observe-replay";
        operationId: string;
        reviewedPeerId: string;
        executeAfterUnixMs: number;
        expected: Readonly<{
          autoSync: boolean;
          localRetentionMs: number;
          pinnedCount: number;
          configurationSha256: string;
        }>;
      }>
  );
const id = (value: unknown, max = 128): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  !/[\s\x00-\x1f\x7f]/.test(value);
const marker = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("clipp-reset-") &&
  value.length <= 256 &&
  !/[\x00-\x1f\x7f]/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
export function parseChromeResetOwningCase(
  text: string,
  now = Date.now()
): ChromeResetOwningCase {
  if (new TextEncoder().encode(text).length > 8192)
    throw Error("invalid_root_case");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("invalid_root_case");
  }
  const keys = [
    "version",
    "mode",
    "caseId",
    "extensionId",
    "deadlineUnixMs",
    "markers",
    "nextMarker",
    "expectedDeviceName",
  ];
  if (
    !record(value) ||
    value.version !== 1 ||
    !id(value.caseId) ||
    !id(value.extensionId) ||
    !integer(value.deadlineUnixMs, now + 1, now + 600_000) ||
    !Array.isArray(value.markers) ||
    value.markers.length < 1 ||
    value.markers.length > 8 ||
    !value.markers.every(marker) ||
    new Set(value.markers).size !== value.markers.length ||
    !marker(value.nextMarker) ||
    value.markers.includes(value.nextMarker) ||
    !marker(value.expectedDeviceName)
  )
    throw Error("invalid_root_case");
  const common = {
    version: 1 as const,
    caseId: value.caseId,
    extensionId: value.extensionId,
    deadlineUnixMs: value.deadlineUnixMs,
    markers: Object.freeze([...value.markers]),
    nextMarker: value.nextMarker,
    expectedDeviceName: value.expectedDeviceName,
  };
  if (value.mode === "observe-preflight" && exact(value, keys))
    return Object.freeze({ ...common, mode: value.mode });
  const e = value.expected;
  if (
    (value.mode !== "execute" && value.mode !== "observe-replay") ||
    !exact(value, [
      ...keys,
      "operationId",
      "reviewedPeerId",
      "executeAfterUnixMs",
      "expected",
    ]) ||
    !id(value.operationId) ||
    !id(value.reviewedPeerId, 512) ||
    !integer(
      value.executeAfterUnixMs,
      value.deadlineUnixMs - 600_000,
      value.deadlineUnixMs - 1000
    ) ||
    !record(e) ||
    !exact(e, [
      "autoSync",
      "localRetentionMs",
      "pinnedCount",
      "configurationSha256",
    ]) ||
    typeof e.autoSync !== "boolean" ||
    !integer(e.localRetentionMs, 0, 315360000000) ||
    !integer(e.pinnedCount, 1, 8) ||
    typeof e.configurationSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(e.configurationSha256)
  )
    throw Error("invalid_root_case");
  return Object.freeze({
    ...common,
    mode: value.mode,
    operationId: value.operationId,
    reviewedPeerId: value.reviewedPeerId,
    executeAfterUnixMs: value.executeAfterUnixMs,
    expected: Object.freeze({
      autoSync: e.autoSync,
      localRetentionMs: e.localRetentionMs,
      pinnedCount: e.pinnedCount,
      configurationSha256: e.configurationSha256,
    }),
  });
}

/** Fixed own-package fetch; never accepts a caller URL or unbounded text body. */
export async function loadPackagedChromeResetOwningCaseText(): Promise<string> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const response = await fetch(
      chrome.runtime.getURL("root-reset-case.json"),
      { cache: "no-store", signal: abort.signal }
    );
    if (!response.ok || !response.body) throw Error("root_case_unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 8192) throw Error("root_case_cap");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
