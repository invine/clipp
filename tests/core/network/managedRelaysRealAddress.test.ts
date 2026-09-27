import { execFileSync } from "node:child_process";

it("rejects a bare Peer ID even though the real multiaddr parser accepts it", () => {
  expect(() =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "tests/harness/managedRelayAddressConformance.ts"],
      { cwd: process.cwd(), stdio: "pipe" }
    )
  ).not.toThrow();
});
