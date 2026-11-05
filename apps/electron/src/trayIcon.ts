import type { nativeImage, NativeImage } from "electron";
import path from "node:path";

export function iconBasePath(
  isPackaged: boolean,
  resourcesPath: string,
  mainBundleDir: string
): string {
  const root = isPackaged
    ? resourcesPath
    : path.resolve(mainBundleDir || process.cwd(), "..", "..", "..");
  return path.join(root, "clipp-electron-icons-bundle");
}

export function trayIconCandidates(
  iconBase: string,
  platform: NodeJS.Platform
): string[] {
  const primary =
    platform === "darwin" ? "clipp-trayTemplate.png" : "clipp-tray.png";
  return [
    path.join(iconBase, primary),
    path.join(iconBase, "clipp-tray-16.png"),
    path.join(iconBase, "clipp-tray-32.png"),
    path.join(iconBase, "clipp-tray-64.png"),
    path.join(iconBase, "clipp-purple-32.png"),
    path.join(iconBase, "clipp-purple-16.png"),
    path.join(iconBase, "clipp-purple-256.png"),
  ];
}

export function pickTrayIcon(
  candidates: string[],
  createFromPath: typeof nativeImage.createFromPath,
  createEmpty: () => NativeImage,
  platform: NodeJS.Platform
): NativeImage {
  for (const candidate of candidates) {
    const image = createFromPath(candidate);
    if (image.isEmpty()) continue;
    image.setTemplateImage(platform === "darwin");
    return image;
  }
  return createEmpty();
}
