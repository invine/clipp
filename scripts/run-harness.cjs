// CJS runner that registers ts-node with SWC to avoid Node's strip-only TS parsing.
require("ts-node").register({
  transpileOnly: true,
  swc: true,
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
