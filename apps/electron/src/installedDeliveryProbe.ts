import { app, clipboard } from "electron";
import { lstatSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

/** A one-use, owned profile for the packaged app's installed Quit check. */
export function prepareInstalledDeliveryProbe() {
  const requested = process.env.CLIPP_DELIVERY_PROBE_PROFILE;
  const token = process.env.CLIPP_DELIVERY_PROBE_TOKEN;
  if (!requested && !token) return;
  if (!requested || !token || !app.isPackaged || process.platform !== "darwin")
    throw new Error("invalid_installed_delivery_probe");
  const root = realpathSync("/private/tmp");
  const profile = realpathSync(requested);
  const stat = lstatSync(profile);
  if (
    !profile.startsWith(`${root}${path.sep}`) ||
    !/^clipp-installed-quit-[A-Za-z0-9]{6}$/.test(path.basename(profile)) ||
    !stat.isDirectory() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    !/^[0-9a-f]{64}$/.test(token)
  )
    throw new Error("invalid_installed_delivery_probe");
  const marker = path.join(profile, ".clipp-delivery-probe.json");
  const markerStat = lstatSync(marker);
  if (
    !markerStat.isFile() ||
    markerStat.uid !== process.getuid?.() ||
    (markerStat.mode & 0o077) !== 0 ||
    markerStat.size > 512
  )
    throw new Error("invalid_installed_delivery_probe");
  const record = JSON.parse(readFileSync(marker, "utf8"));
  if (
    record.schema !== 1 ||
    record.token !== token ||
    !Number.isSafeInteger(record.expiresAt) ||
    record.expiresAt < Date.now() ||
    record.expiresAt > Date.now() + 120_000
  )
    throw new Error("invalid_installed_delivery_probe");
  rmSync(marker);
  delete process.env.CLIPP_DELIVERY_PROBE_PROFILE;
  delete process.env.CLIPP_DELIVERY_PROBE_TOKEN;
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
  clipboard.readText = () => "";
  clipboard.writeText = () => {};
}
