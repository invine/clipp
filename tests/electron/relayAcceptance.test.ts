import {
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { electronRelayAcceptance } from "../../apps/electron/src/relayAcceptance";

it("requires an isolated absolute Electron profile before enabling a forced relay transport", () => {
  expect(electronRelayAcceptance({}, "/normal/profile")).toBeUndefined();
  for (const profile of [
    undefined,
    "relative",
    "/normal/profile",
    "/normal",
    "/normal/profile/child",
  ]) {
    expect(() =>
      electronRelayAcceptance(
        {
          CLIPP_RELAY_ACCEPTANCE_TRANSPORT: "wss",
          CLIPP_RELAY_ACCEPTANCE_PROFILE: profile,
        },
        "/normal/profile"
      )
    ).toThrow("isolated_acceptance_profile_required");
  }
  expect(
    electronRelayAcceptance(
      {
        CLIPP_RELAY_ACCEPTANCE_TRANSPORT: "wss",
        CLIPP_RELAY_ACCEPTANCE_PROFILE: "/isolated/profile",
      },
      "/normal/profile"
    )
  ).toEqual({ profile: "/isolated/profile", transport: "wss" });
  expect(() =>
    electronRelayAcceptance(
      {
        CLIPP_RELAY_ACCEPTANCE_TRANSPORT: "ws",
        CLIPP_RELAY_ACCEPTANCE_PROFILE: "/isolated/profile",
      },
      "/normal/profile"
    )
  ).toThrow("unsupported_acceptance_transport");
});

it("rejects aliases of the normal profile, including new children through a symlink", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "clipp-acceptance-profile-"));
  try {
    const normal = path.join(fixture, "normal");
    const alias = path.join(fixture, "alias");
    mkdirSync(normal);
    symlinkSync(normal, alias);
    for (const profile of [alias, path.join(alias, "new-child")]) {
      expect(() =>
        electronRelayAcceptance(
          {
            CLIPP_RELAY_ACCEPTANCE_TRANSPORT: "wss",
            CLIPP_RELAY_ACCEPTANCE_PROFILE: profile,
          },
          normal
        )
      ).toThrow("isolated_acceptance_profile_required");
    }
    const isolated = path.join(realpathSync(fixture), "new", "profile");
    expect(
      electronRelayAcceptance(
        {
          CLIPP_RELAY_ACCEPTANCE_TRANSPORT: "wss",
          CLIPP_RELAY_ACCEPTANCE_PROFILE: isolated,
        },
        normal
      )?.profile
    ).toBe(isolated);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
