import { execFileSync } from "node:child_process";
import path from "node:path";

it("imports the complete scanned Signed Peer Record and rejects invalid signatures and identity mismatches before dialing", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", path.join(__dirname, "verifySignedQr.mjs")],
    { encoding: "utf8", timeout: 25000 }
  );
  expect(output.trim()).toBe(
    "verified all 20 addresses; blocked damaged signature and mismatched identity"
  );
}, 30000);
