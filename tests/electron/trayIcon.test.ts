import type { NativeImage } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  iconBasePath,
  pickTrayIcon,
  trayIconCandidates,
} from "../../apps/electron/src/trayIcon";

it("loads packaged icons from the macOS Resources directory", () => {
  expect(
    iconBasePath(
      true,
      "/Applications/Clipp.app/Contents/Resources",
      "/Applications/Clipp.app/Contents/Resources/app/dist"
    )
  ).toBe(
    "/Applications/Clipp.app/Contents/Resources/clipp-electron-icons-bundle"
  );
});

it("loads development icons from the Electron asset directory", () => {
  expect(iconBasePath(false, "/unused", "/repo/apps/electron/dist")).toBe(
    "/repo/apps/electron/assets/icons"
  );
});

it("makes the selected macOS menu bar image adapt to light and dark backgrounds", () => {
  const image = {
    isEmpty: () => false,
    setTemplateImage: jest.fn(),
  } as unknown as NativeImage;

  expect(
    pickTrayIcon(
      ["clipp-tray-16.png"],
      () => image,
      () => image,
      "darwin"
    )
  ).toBe(image);
  expect(image.setTemplateImage).toHaveBeenCalledWith(true);
});

it("prefers the density-aware template artwork on macOS and a visible mark elsewhere", () => {
  expect(trayIconCandidates("/resources/icons", "darwin")).toEqual([
    "/resources/icons/clipp-trayTemplate.png",
    "/resources/icons/clipp-trayTemplate-16.png",
    "/resources/icons/clipp-trayTemplate-32.png",
    "/resources/icons/clipp-trayTemplate-64.png",
    "/resources/icons/clipp-trayTemplate@2x.png",
    "/resources/icons/clipp-tray-16.png",
    "/resources/icons/clipp-tray-32.png",
    "/resources/icons/clipp-tray-64.png",
    "/resources/icons/clipp-purple-32.png",
    "/resources/icons/clipp-purple-16.png",
    "/resources/icons/clipp-purple-256.png",
  ]);
  expect(trayIconCandidates("/resources/icons", "win32")).toEqual([
    "/resources/icons/clipp-tray.png",
    "/resources/icons/clipp-tray-16.png",
    "/resources/icons/clipp-tray-32.png",
    "/resources/icons/clipp-tray-64.png",
    "/resources/icons/clipp-tray@2x.png",
    "/resources/icons/clipp-purple-32.png",
    "/resources/icons/clipp-purple-16.png",
    "/resources/icons/clipp-purple-256.png",
  ]);
});

it("keeps the selected artwork as a macOS template and disables template mode elsewhere", () => {
  const image = {
    isEmpty: () => false,
    setTemplateImage: jest.fn(),
  } as unknown as NativeImage;
  pickTrayIcon(
    ["tray.png"],
    () => image,
    () => image,
    "win32"
  );
  expect(image.setTemplateImage).toHaveBeenCalledWith(false);
});

it.each(["apps/electron/assets/icons", "clipp-electron-icons-bundle"])(
  "ships 1x and 2x tray artwork in %s",
  (directory) => {
    for (const base of ["clipp-tray", "clipp-trayTemplate"]) {
      const oneX = readFileSync(path.join(directory, `${base}.png`));
      const twoX = readFileSync(path.join(directory, `${base}@2x.png`));
      expect(oneX.readUInt32BE(16)).toBe(16);
      expect(oneX.readUInt32BE(20)).toBe(16);
      expect(twoX.readUInt32BE(16)).toBe(32);
      expect(twoX.readUInt32BE(20)).toBe(32);
    }
  }
);
