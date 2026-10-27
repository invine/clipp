import { resetOverlapAlias } from "../../apps/android/scripts/resetOverlapAlias";

test("the acceptance alias only substitutes the two exact Android client port imports", () => {
  const client = "/repo/apps/android/src/client.ts";
  const alias = resetOverlapAlias(client, "/repo/apps/android/src/resetOverlapAcceptancePorts.ts");
  expect(alias("./backgroundContinuityNative", client)).toBe("/repo/apps/android/src/resetOverlapAcceptancePorts.ts");
  expect(alias("./identityResetRuntime", client)).toBe("/repo/apps/android/src/resetOverlapAcceptancePorts.ts");
  expect(alias("./identityResetRuntime", "/repo/apps/android/src/other.ts")).toBeNull();
  expect(alias("./other", client)).toBeNull();
  expect(alias("./backgroundContinuityNative", undefined)).toBeNull();
});

test("an acceptance build refuses to proceed unless both actual client imports were matched", () => {
  const client = "/repo/apps/android/src/client.ts";
  const alias = resetOverlapAlias(client, "/repo/apps/android/src/resetOverlapAcceptancePorts.ts");
  alias("./backgroundContinuityNative", client);
  expect(() => alias.verify()).toThrow("overlap_alias_missing");
  alias("./identityResetRuntime", client);
  expect(() => alias.verify()).not.toThrow();
});
