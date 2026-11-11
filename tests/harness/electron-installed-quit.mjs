import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { _electron as electron } from "playwright";

const [executableArg, asarArg, profileArg] = process.argv.slice(2);
assert.ok(
  executableArg && asarArg && profileArg,
  "Supply installed executable, app.asar and isolated profile"
);
const executable = realpathSync(executableArg);
const asar = realpathSync(asarArg);
const profile = realpathSync(profileArg);
assert.ok(
  lstatSync(profile).isDirectory(),
  "Installed Quit profile must exist"
);
const token = randomBytes(32).toString("hex");
const marker = path.join(profile, ".clipp-delivery-probe.json");
writeFileSync(
  marker,
  JSON.stringify({ schema: 1, token, expiresAt: Date.now() + 120_000 }),
  { flag: "wx", mode: 0o600 }
);
const childEnvironment = {
  ...process.env,
  CLIPP_DELIVERY_PROBE_PROFILE: profile,
  CLIPP_DELIVERY_PROBE_TOKEN: token,
};
for (const name of [
  "ELECTRON_RUN_AS_NODE",
  "VITE_DEV_SERVER_URL",
  "CLIPP_RELAY_ACCEPTANCE_PROFILE",
  "CLIPP_RELAY_ACCEPTANCE_TRANSPORT",
])
  delete childEnvironment[name];

let child;
let deadline;
try {
  const instance = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`],
    env: childEnvironment,
    timeout: 30_000,
  });
  child = instance.process();
  const exited = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal }))
  );
  child.stdout?.resume();
  child.stderr?.resume();
  const observed = await instance.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    executable: process.execPath,
    pid: process.pid,
    appPath: app.getAppPath(),
    userData: app.getPath("userData"),
    sessionData: app.getPath("sessionData"),
  }));
  assert.equal(observed.packaged, true);
  assert.equal(realpathSync(observed.executable), executable);
  assert.equal(observed.pid, child.pid);
  assert.equal(realpathSync(observed.appPath), asar);
  assert.equal(realpathSync(observed.userData), profile);
  assert.equal(realpathSync(observed.sessionData), profile);
  await Promise.race([
    instance.firstWindow(),
    new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error("Installed Clipp window did not open")),
        30_000
      );
    }),
  ]);
  clearTimeout(deadline);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await instance.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 0);
  });
  const result = await Promise.race([
    exited,
    new Promise((_, reject) => {
      deadline = setTimeout(
        () =>
          reject(new Error("Installed Clipp remains alive after normal Quit")),
        10_000
      );
    }),
  ]);
  assert.deepEqual(result, { code: 0, signal: null });
  console.log(
    JSON.stringify({
      result: "installed-launch-normal-quit-passed",
      executable,
      profile,
      pid: child.pid,
    })
  );
} finally {
  clearTimeout(deadline);
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await exited;
  }
  if (existsSync(marker)) rmSync(marker);
}
