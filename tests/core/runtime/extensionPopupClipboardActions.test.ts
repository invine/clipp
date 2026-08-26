import {
  isAuthorizedPopupShareNowSender,
  shareCurrentPopupClipboard,
} from "../../../apps/extension/src/popupClipboardActions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Chrome popup clipboard actions", () => {
  it("reads exact current text before handing Share Now to the background", async () => {
    const readText = jest.fn(async () => "  exact\r\ntext  ");
    const shareNow = jest.fn(async (_text: string) => {});

    await shareCurrentPopupClipboard(readText, shareNow);

    expect(readText).toHaveBeenCalledTimes(1);
    expect(shareNow).toHaveBeenCalledWith("  exact\r\ntext  ");
  });

  it("reports a stable read failure and does not hand off Share Now", async () => {
    const shareNow = jest.fn(async (_text: string) => {});

    await expect(shareCurrentPopupClipboard(
      async () => { throw new Error("permission denied"); },
      shareNow,
    )).rejects.toMatchObject({
      code: "clipboard_read_failed",
      message: "clipboard_read_failed",
    });

    expect(shareNow).not.toHaveBeenCalled();
  });

  it("authorizes text-bearing Share Now only from the extension popup", () => {
    const popupUrl = "chrome-extension://clipp/src/popup.html";

    expect(isAuthorizedPopupShareNowSender(popupUrl, popupUrl)).toBe(true);
    expect(isAuthorizedPopupShareNowSender("chrome-extension://clipp/src/options.html", popupUrl)).toBe(false);
    expect(isAuthorizedPopupShareNowSender("https://example.com/page", popupUrl)).toBe(false);
    expect(isAuthorizedPopupShareNowSender(undefined, popupUrl)).toBe(false);
  });

  it("declares the Chrome version required by the offscreen clipboard runtime", () => {
    const manifest = JSON.parse(readFileSync(resolve("apps/extension/manifest.json"), "utf8"));

    expect(manifest.minimum_chrome_version).toBe("109");
  });
});
