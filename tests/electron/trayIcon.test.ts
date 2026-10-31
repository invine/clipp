import type { NativeImage } from "electron";
import { iconBasePath, pickTrayIcon } from "../../apps/electron/src/trayIcon";

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

it("loads development icons from the repository root", () => {
  expect(iconBasePath(false, "/unused", "/repo/apps/electron/dist")).toBe(
    "/repo/clipp-electron-icons-bundle"
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
