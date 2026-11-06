import type { nativeImage, NativeImage } from "electron";
import path from "node:path";

export function iconBasePath(
  isPackaged: boolean,
  resourcesPath: string,
  mainBundleDir: string
): string {
  return isPackaged
    ? path.join(resourcesPath, "clipp-electron-icons-bundle")
    : path.resolve(mainBundleDir || process.cwd(), "..", "assets", "icons");
}

export function trayIconCandidates(
  iconBase: string,
  platform: NodeJS.Platform
): string[] {
  // Prefer the supplied 16 px template artwork and its 2x render on macOS.
  const names =
    platform === "darwin"
      ? [
          "clipp-trayTemplate-16.png",
          "clipp-trayTemplate-16@2x.png",
          "clipp-trayTemplate.png",
          "clipp-trayTemplate@2x.png",
          "clipp-trayTemplate-32.png",
          "clipp-trayTemplate-64.png",
          "clipp-tray-16.png",
          "clipp-tray-32.png",
          "clipp-tray-64.png",
          "clipp-purple-32.png",
          "clipp-purple-16.png",
          "clipp-purple-256.png",
        ]
      : [
          "clipp-tray.png",
          "clipp-tray-16.png",
          "clipp-tray-32.png",
          "clipp-tray-64.png",
          "clipp-tray@2x.png",
          "clipp-purple-32.png",
          "clipp-purple-16.png",
          "clipp-purple-256.png",
        ];
  return names.map((name) => path.join(iconBase, name));
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
