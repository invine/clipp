jest.mock(
  "electron",
  () => ({
    app: { isPackaged: true, setPath: jest.fn(), exit: jest.fn() },
    clipboard: { readText: jest.fn(), writeText: jest.fn() },
    dialog: { showErrorBox: jest.fn() },
  }),
  { virtual: true }
);

import { app } from "electron";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { prepareInstalledDeliveryProbe } from "../../apps/electron/src/installedDeliveryProbe";

const macIt = process.platform === "darwin" ? it : it.skip;
const setPath = app.setPath as jest.Mock;

afterEach(() => {
  delete process.env.CLIPP_DELIVERY_PROBE_PROFILE;
  delete process.env.CLIPP_DELIVERY_PROBE_TOKEN;
  setPath.mockClear();
});

it("leaves normal packaged startup untouched without a probe token", () => {
  prepareInstalledDeliveryProbe();
  expect(setPath).not.toHaveBeenCalled();
});

macIt("accepts a one-use token for a fresh owned temporary profile", () => {
  const profile = realpathSync(
    mkdtempSync("/private/tmp/clipp-installed-quit-")
  );
  try {
    const token = randomBytes(32).toString("hex");
    const marker = path.join(profile, ".clipp-delivery-probe.json");
    writeFileSync(
      marker,
      JSON.stringify({ schema: 1, token, expiresAt: Date.now() + 60_000 }),
      { mode: 0o600 }
    );
    process.env.CLIPP_DELIVERY_PROBE_PROFILE = profile;
    process.env.CLIPP_DELIVERY_PROBE_TOKEN = token;
    prepareInstalledDeliveryProbe();
    expect(setPath.mock.calls).toEqual([
      ["userData", profile],
      ["sessionData", profile],
    ]);
    expect(existsSync(marker)).toBe(false);
    expect(process.env.CLIPP_DELIVERY_PROBE_TOKEN).toBeUndefined();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});

macIt("rejects a token mismatch before selecting any profile", () => {
  const profile = realpathSync(
    mkdtempSync("/private/tmp/clipp-installed-quit-")
  );
  try {
    writeFileSync(
      path.join(profile, ".clipp-delivery-probe.json"),
      JSON.stringify({
        schema: 1,
        token: randomBytes(32).toString("hex"),
        expiresAt: Date.now() + 60_000,
      }),
      { mode: 0o600 }
    );
    process.env.CLIPP_DELIVERY_PROBE_PROFILE = profile;
    process.env.CLIPP_DELIVERY_PROBE_TOKEN = randomBytes(32).toString("hex");
    expect(() => prepareInstalledDeliveryProbe()).toThrow(
      "invalid_installed_delivery_probe"
    );
    expect(setPath).not.toHaveBeenCalled();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});
