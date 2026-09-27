import { execFileSync } from "node:child_process";

const MINIMUM_API_LEVEL = 31;
const adb = process.env.CLIPP_ANDROID_ADB || "adb";

function runAdb(args) {
  return execFileSync(adb, args, { encoding: "utf8" }).trim();
}

function connectedDeviceSerials(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === "device")
    .map(([serial]) => serial);
}

try {
  const devices = connectedDeviceSerials(runAdb(["devices"]));
  const eligible = devices.flatMap((serial) => {
    const rawApiLevel = runAdb(["-s", serial, "shell", "getprop", "ro.build.version.sdk"]);
    const apiLevel = Number.parseInt(rawApiLevel, 10);
    const isEmulator = runAdb(["-s", serial, "shell", "getprop", "ro.kernel.qemu"]) === "1";
    return Number.isInteger(apiLevel) && apiLevel >= MINIMUM_API_LEVEL && isEmulator
      ? [{ serial, apiLevel }]
      : [];
  });

  if (eligible.length === 0) {
    console.error("Android instrumentation requires at least one connected API 31 or later emulator.");
    process.exitCode = 1;
  } else {
    console.log(`Android 12+ test target: ${eligible.map(({ serial, apiLevel }) => `${serial} (API ${apiLevel})`).join(", ")}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to verify an Android API 31 or later emulator: ${message}`);
  process.exitCode = 1;
}
