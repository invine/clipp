import { execFileSync } from "node:child_process";

it("retains distinct physical transports and promotes the stock reservation on one Device Identity", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "tests/harness/managedRelayTransportConformance.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 20_000,
      stdio: "pipe",
    }
  );
  expect(JSON.parse(output.trim())).toMatchObject({
    ok: true,
    physicalConnections: 2,
    reservationOwners: 1,
    promoted: true,
  });
});
