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
    deviceName: "Saved Desktop",
    nameRevision: 2,
    autoSync: false,
    sharingLifetimeMs: 3600000,
    syntheticClips: [
      {
        id: "clip-one",
        originPeerId: "former-peer",
        capturedAt: now - 1000,
        shareExpiresAt: now + 3599000,
        pinned: true,
      },
    ],
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
    expect(value.expected.deviceName).toBe("Saved Desktop");
    expect(value.expected.nameRevision).toBe(2);
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

it("requires the exact bounded synthetic allowlist on preflight", () => {
  const value = {
    version: 1,
    mode: "observe-preflight",
    caseId: "case",
    deadlineUnixMs: now + 1,
    markers: ["clipp-reset-public"],
  };
  expect(
    parseElectronResetOwningManifest(JSON.stringify(value), now).mode
  ).toBe("observe-preflight");
  const { markers: ignored, ...missing } = value;
  void ignored;
  expect(() =>
    parseElectronResetOwningManifest(JSON.stringify(missing), now)
  ).toThrow("invalid_manifest");
});
it.each([
  { ...manifest.expected, sharingLifetimeMs: 0 },
  { ...manifest.expected, syntheticClips: [] },
  {
    ...manifest.expected,
    syntheticClips: [
      { ...manifest.expected.syntheticClips[0], originPeerId: "foreign" },
    ],
  },
  {
    ...manifest.expected,
    syntheticClips: [
      { ...manifest.expected.syntheticClips[0], content: "forbidden" },
    ],
  },
  {
    ...manifest.expected,
    syntheticClips: [
      { ...manifest.expected.syntheticClips[0], capturedAt: 0.5 },
    ],
  },
  {
    ...manifest.expected,
    syntheticClips: [
      { ...manifest.expected.syntheticClips[0], shareExpiresAt: now - 1001 },
    ],
  },
  {
    ...manifest.expected,
    syntheticClips: [{ ...manifest.expected.syntheticClips[0], pinned: false }],
  },
])(
  "refuses incomplete, foreign or unsafe persisted metadata %#",
  (expected) => {
    expect(() =>
      parseElectronResetOwningManifest(
        JSON.stringify({ ...manifest, expected }),
        now
      )
    ).toThrow("invalid_manifest");
  }
);

it.each([
  { ...manifest.expected, deviceName: undefined },
  { ...manifest.expected, deviceName: "" },
  { ...manifest.expected, deviceName: " Saved Desktop" },
  { ...manifest.expected, deviceName: "e\u0301" },
  { ...manifest.expected, deviceName: "line\nname" },
  { ...manifest.expected, deviceName: "a".repeat(65) },
  { ...manifest.expected, nameRevision: undefined },
  { ...manifest.expected, nameRevision: 0 },
  { ...manifest.expected, nameRevision: 1.5 },
  { ...manifest.expected, nameRevision: Number.MAX_SAFE_INTEGER + 1 },
])(
  "rejects missing or noncanonical saved names and revisions %#",
  (expected) => {
    expect(() =>
      parseElectronResetOwningManifest(
        JSON.stringify({ ...manifest, expected }),
        now
      )
    ).toThrow("invalid_manifest");
  }
);

it("retains normalized internal spaces and bounded Unicode names", () => {
  const value = parseElectronResetOwningManifest(
    JSON.stringify({
      ...manifest,
      expected: { ...manifest.expected, deviceName: "é Saved Desktop" },
    }),
    now
  );
  expect(value.mode !== "observe-preflight" && value.expected.deviceName).toBe(
    "é Saved Desktop"
  );
});

it("retains the aggregate input cap with saved name evidence", () => {
  expect(() =>
    parseElectronResetOwningManifest(
      JSON.stringify(manifest) + " ".repeat(8192),
      now
    )
  ).toThrow("invalid_manifest");
});
