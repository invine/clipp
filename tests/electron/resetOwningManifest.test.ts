import { parseElectronResetOwningManifest } from "../../apps/electron/src/resetOwningManifest";

const now = 1_800_000_000_000;
const manifest = {
  version: 1,
  mode: "execute",
  caseId: "electron29-case",
  deadlineUnixMs: now + 60000,
  operationId: "electron29-operation",
  reviewedPeerId: "former-peer",
  expected: {
    autoSync: false,
    localRetentionMs: 604800000,
    markers: ["clipp-reset-before"],
    nextMarker: "clipp-reset-after",
    pinnedCount: 1,
    configurationSha256:
      "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  },
};

it("freezes the immutable owning input without accepting runtime commands", () => {
  const value = parseElectronResetOwningManifest(JSON.stringify(manifest), now);
  expect(value.mode).toBe("execute");
  expect(Object.isFrozen(value)).toBe(true);
  if (value.mode !== "observe-preflight") {
    expect(Object.isFrozen(value.expected)).toBe(true);
    expect(Object.isFrozen(value.expected.markers)).toBe(true);
  }
});

it.each([
  { ...manifest, command: "begin" },
  { ...manifest, mode: "resume" },
  { ...manifest, reviewedPeerId: "" },
  { ...manifest, deadlineUnixMs: now },
  { ...manifest, deadlineUnixMs: now + 600001 },
  { ...manifest, expected: { ...manifest.expected, token: "forbidden" } },
  { ...manifest, expected: { ...manifest.expected, markers: ["unscoped"] } },
  {
    ...manifest,
    expected: {
      ...manifest.expected,
      markers: ["clipp-reset-a", "clipp-reset-a"],
    },
  },
  {
    ...manifest,
    expected: { ...manifest.expected, nextMarker: "clipp-reset-before" },
  },
])("rejects unsafe or unsupported owning input before startup %#", (value) => {
  expect(() =>
    parseElectronResetOwningManifest(JSON.stringify(value), now)
  ).toThrow("invalid_manifest");
});
