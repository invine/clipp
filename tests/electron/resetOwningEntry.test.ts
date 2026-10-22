import { execFileSync } from "node:child_process";

it.each([
  ["keeps saved Auto Sync and the live public state consistent", "settings"],
  ["observes the existing owner", "preflight"],
  ["refuses a stale reviewed identity", "mismatch"],
  ["reports a completed reset with restart still required", "execute"],
  ["refuses unreset History on replay", "replay"],
  ["starts no owner for invalid input", "invalid"],
])("the opt-in Electron owning entry %s", (_description, mode) => {
  execFileSync(
    process.execPath,
    ["tests/harness/electron-main-window.mjs", `reset-entry-${mode}`],
    { stdio: "pipe", timeout: 30000 }
  );
});
