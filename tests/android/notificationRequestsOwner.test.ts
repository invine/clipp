import { execFileSync } from "node:child_process";
it("the actual Android client connects native selection and separate app/channel recovery to the session owner", () => {
  execFileSync(
    process.execPath,
    ["tests/harness/android-notification-requests.mjs"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 20_000,
    }
  );
});
