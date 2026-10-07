#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(name, args, capture = false) {
  console.log(`\n[verify] ${name}: npm ${args.join(" ")}`);
  const result = spawnSync("npm", args, {
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    if (capture) process.stderr.write(result.stderr ?? "");
    console.error(
      `[verify] FAILED ${name}: ${result.error?.message ?? `exit ${result.status ?? result.signal}`}`
    );
    process.exit(result.status || 1);
  }
  return result.stdout?.trim();
}

console.log(`[verify] Node ${process.version}`);
console.log(`[verify] npm ${run("npm prerequisite", ["--version"], true)}`);
run("lint", ["run", "lint"]);
run("typechecks and Jest", ["run", "check"]);
run("Electron production build", [
  "--workspace",
  "apps/electron",
  "run",
  "build",
]);
run("Android web production build", [
  "--workspace",
  "apps/android",
  "run",
  "build",
]);
run("Chrome production build", [
  "--workspace",
  "apps/extension",
  "run",
  "build",
]);
console.log(
  "\n[verify] PASS routine checks. Native packaging, signed installation, browser login, device instrumentation and forced live relay transfers are outside this coverage."
);
