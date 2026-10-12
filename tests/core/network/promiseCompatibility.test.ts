import { execFileSync } from "node:child_process";

function runCompatibility(mode: string, bootstrap = "node") {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "tests/harness/promiseCompatibility.mjs",
      mode,
      bootstrap,
    ],
    { cwd: process.cwd(), stdio: "pipe", timeout: 15_000 }
  );
}

it("initializes the real clipboard node and peer store without Promise.withResolvers", () => {
  runCompatibility("missing");
});

it("preserves the native method through real networking initialization", () => {
  runCompatibility("native");
});

it("preserves queue errors, aborted lock requests and later lock acquisition", () => {
  runCompatibility("errors");
});

it("preserves Promise subclass, settlement and property semantics", () => {
  runCompatibility("semantics");
});

it("keeps the relay bootstrap compatible with the same real locking dependency", () => {
  runCompatibility("missing", "relay");
});
