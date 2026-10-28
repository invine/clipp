/* eslint-disable @typescript-eslint/no-var-requires -- Loaded by the Electron CommonJS startup wrapper. */
/** Selected Electron startup dependencies; this is not dependency-graph certification. */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

module.exports = function requiredNative({ root, expected, output }) {
  const observation = {
    runtime: {
      electron: process.versions.electron,
      node: process.versions.node,
      modules: process.versions.modules,
      napi: process.versions.napi,
      platform: process.platform,
      architecture: process.arch,
      executable: process.execPath,
    },
    required: [],
  };
  let selected;
  try {
    if (
      observation.runtime.electron !== expected.runtimeVersion ||
      fs.realpathSync(process.execPath) !==
        fs.realpathSync(expected.executable) ||
      (expected.moduleAbi &&
        observation.runtime.modules !== expected.moduleAbi) ||
      process.platform !== expected.platform ||
      process.arch !== expected.architecture
    )
      throw new Error("frozen_candidate_runtime_mismatch");
    const resolve = createRequire(
      path.join(root, "apps/electron/package.json")
    );
    for (const name of ["better-sqlite3", "@koush/wrtc"]) {
      selected = name;
      const entry = fs.realpathSync(resolve.resolve(name));
      const relative = path.relative(root, entry);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Error("required_native_wrong_candidate");
      const loaded = resolve(name);
      if (name === "better-sqlite3") {
        const database = new loaded(":memory:");
        database.close();
      } else if (typeof loaded.RTCPeerConnection !== "function")
        throw new Error("required_native_module_invalid");
      observation.required.push({ name, entry, loaded: true });
    }
    observation.result = "passed";
  } catch (error) {
    observation.result = "failed";
    observation.requiredModule = selected;
    observation.reason =
      error.message === "frozen_candidate_runtime_mismatch" ||
      error.message === "required_native_wrong_candidate"
        ? error.message
        : error.code === "MODULE_NOT_FOUND"
          ? "required_native_module_missing"
          : /NODE_MODULE_VERSION|N-API|NODE_API_MODULE/i.test(error.message)
            ? "required_native_abi_mismatch"
            : "required_native_module_load_failed";
    fs.writeFileSync(
      `${output}.private.json`,
      JSON.stringify({ message: error.message, stack: error.stack }),
      { mode: 0o600 }
    );
  }
  fs.writeFileSync(output, JSON.stringify(observation, null, 2) + "\n", {
    mode: 0o600,
  });
  return observation.result === "passed";
};
