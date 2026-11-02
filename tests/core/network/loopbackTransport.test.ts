import { spawnSync } from "node:child_process";

function runOwnedSource(path: string) {
  const child = spawnSync(process.execPath, ["--import", "tsx", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 262144,
  });
  for (const line of (child.stdout ?? "").split("\n"))
    if (line.startsWith("SOURCE_RECEIPT ")) console.info(line);
  if (child.error || child.status !== 0) {
    console.error(
      "SOURCE child termination",
      JSON.stringify({
        pid: child.pid,
        status: child.status,
        signal: child.signal,
        error: child.error?.message,
      })
    );
    console.error(child.stdout);
    console.error(child.stderr);
  }
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  expect(child.status).toBe(0);
}

it("a native owner can advertise a genuine signed endpoint confined to loopback without discovery", () => {
  runOwnedSource("tests/harness/loopback-transport-source.mjs");
});

it("the genuine notification actor learns only an actual incoming peer and sends one signed reverse request", () => {
  runOwnedSource("tests/harness/notification-peer-protocol-source.mjs");
});
