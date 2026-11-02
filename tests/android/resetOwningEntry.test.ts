import { execFileSync } from "node:child_process";

function runEntry(mode: string) {
  execFileSync(
    process.execPath,
    ["tests/harness/android-reset-owning-entry.mjs", mode],
    { cwd: process.cwd(), stdio: "pipe", timeout: 30_000 }
  );
}

it("the maintained Android reset entry rejects manifest commands before creating a runtime", () => {
  runEntry("invalid");
});

it("the maintained preflight awaits its actual shell owner and tears it down on page exit", () => {
  runEntry("preflight");
});

it("the maintained execute entry refuses a reviewed identity mismatch without resetting the current client", () => {
  runEntry("stale");
});

it("the maintained execute entry resets its real client and reconciles completion after document replacement without replaying", () => {
  runEntry("execute");
});

it("the maintained entry keeps unknown native acceptance fenced without a new reset or cleanup", () => {
  runEntry("unknown");
});

it("the maintained entry resumes its actual accepted operation after external cleanup failure and document replacement", () => {
  runEntry("resume");
});

it("the preflight entry never treats later DOM changes as an execute command", () => {
  runEntry("immutable");
});

it("the maintained entry reconciles transient checking and resumes the same accepted operation without reopening ordinary services", () => {
  runEntry("checking-resume");
});

it("preflight readiness waits for known native background settings and recovers after a real adapter refresh", () => {
  runEntry("background-unknown");
});

it("persistent checking reaches its original deadline without starting a reset or cleaning up", () => {
  runEntry("unknown-timeout");
});
