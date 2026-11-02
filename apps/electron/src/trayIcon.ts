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
