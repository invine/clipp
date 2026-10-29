import {
  isAuthorizedPopupShareNowSender,
  shareCurrentPopupClipboard,
} from "../../../apps/extension/src/popupClipboardActions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Chrome popup clipboard actions", () => {
  it("reads exact current text in the popup before handing Share Now to background", async () => {
    const readText = jest.fn(async () => "  exact\r\ntext  ");
    const shareNow = jest.fn(async (_text: string) => {});

    await shareCurrentPopupClipboard(readText, shareNow);

    expect(readText).toHaveBeenCalledTimes(1);
    expect(shareNow).toHaveBeenCalledWith("  exact\r\ntext  ");
  });

  it("does not send Share Now when the popup clipboard read fails", async () => {
    const shareNow = jest.fn(async (_text: string) => {});

    await expect(
      shareCurrentPopupClipboard(async () => {
        throw new Error("Document is not focused");
      }, shareNow)
    ).rejects.toMatchObject({
      code: "clipboard_read_failed",
      message: "clipboard_read_failed",
    });

    expect(shareNow).not.toHaveBeenCalled();
  });

  it("authorizes Share Now only from the extension popup", () => {
    const popupUrl = "chrome-extension://clipp/src/popup.html";

    expect(isAuthorizedPopupShareNowSender(popupUrl, popupUrl)).toBe(true);
    expect(
      isAuthorizedPopupShareNowSender(
        "chrome-extension://clipp/src/options.html",
        popupUrl
      )
    ).toBe(false);
    expect(
      isAuthorizedPopupShareNowSender("https://example.com/page", popupUrl)
    ).toBe(false);
    expect(isAuthorizedPopupShareNowSender(undefined, popupUrl)).toBe(false);
  });

  it("declares the Chrome version required by the offscreen clipboard runtime", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("apps/extension/manifest.json"), "utf8")
    );

    expect(manifest.minimum_chrome_version).toBe("109");
  });
});
