import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceIdentity } from "../../../scripts/source-identity.mjs";

export { sourceIdentity };

if (process.argv.includes("--source-identity")) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.."
  );
  console.log(JSON.stringify(await sourceIdentity(root)));
}
