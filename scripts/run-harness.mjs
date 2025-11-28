// Registers ts-node in ESM mode, then runs the pairing harness.
import { register } from "ts-node";

register({
  transpileOnly: false,
  esm: true,
  preferTsExts: true,
  compilerOptions: {
    module: "NodeNext",
    moduleResolution: "NodeNext",
    allowImportingTsExtensions: true,
  },
});

import("../tests/harness/pairing-harness.ts").catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
