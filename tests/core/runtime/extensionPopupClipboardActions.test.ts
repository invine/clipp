import { isAuthorizedPopupShareNowSender } from "../../../apps/extension/src/popupClipboardActions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Chrome popup clipboard actions", () => {
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
