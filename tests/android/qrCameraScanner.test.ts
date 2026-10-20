import { scanPairingQrWithCamera } from "../../apps/android/src/qrCameraScanner";
import { scannerBrowserBoundary } from "./scannerBrowserBoundary";
import { createPairingCode } from "../../packages/core/pairing/qrCode";
import {
  encodePairingTarget,
  decodePairingTarget,
} from "../../packages/core/pairing/v2";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
const signedTarget = JSON.parse(
  readFileSync("tests/core/pairing/fixtures/signed-qr-target.json", "utf8")
);

it("Cancel settles capture distinctly and stops a camera acquired after cancellation", async () => {
  const browser = scannerBrowserBoundary();
  try {
    const result = scanPairingQrWithCamera();
    browser.button("Cancel").dispatchEvent(new Event("click"));
    expect(await result).toEqual({ status: "cancelled" });
    const stopped = browser.acquire();
    await browser.flush();
    expect(stopped()).toBe(1);
    expect(browser.overlayCount()).toBe(0);
    expect(browser.frameCount()).toBe(0);
    expect(browser.providerCalls()).toBe(0);
  } finally {
    browser.restore();
  }
});

it("synchronous media boundary failure is typed and disposes its overlay", async () => {
  const browser = scannerBrowserBoundary();
  browser.setAcquireError(new DOMException("camera busy", "NotReadableError"));
  try {
    await expect(scanPairingQrWithCamera()).resolves.toEqual({
      status: "failed",
      error: "camera_unavailable",
    });
    expect(browser.overlayCount()).toBe(0);
  } finally {
    browser.button("Cancel")?.dispatchEvent(new Event("click"));
    browser.restore();
  }
});

it("unavailable canvas terminates without leaving even a scheduled frame", async () => {
  const browser = scannerBrowserBoundary();
  browser.withoutCanvas();
  try {
    const result = scanPairingQrWithCamera();
    const stopped = browser.acquire();
    await browser.flush();
    await browser.frame();
    expect(await result).toEqual({
      status: "failed",
      error: "camera_decode_failed",
    });
    expect(stopped()).toBe(1);
    expect(browser.frameCount()).toBe(0);
  } finally {
    browser.restore();
  }
});

it("the actual scanner decodes generated public signed-target pixels through jsQR without touching the native provider", async () => {
  const target = {
    targetPeerId: signedTarget.targetPeerId,
    signedPeerRecord: new Uint8Array(
      Buffer.from(signedTarget.signedPeerRecord, "base64")
    ),
  };
  const code = await createPairingCode(encodePairingTarget(target));
  const image = PNG.sync.read(Buffer.from(code.image!.split(",")[1], "base64"));
  const browser = scannerBrowserBoundary();
  try {
    const result = scanPairingQrWithCamera();
    browser.setPixels({
      data: new Uint8ClampedArray(image.data),
      width: image.width,
      height: image.height,
    });
    const stopped = browser.acquire();
    await browser.flush();
    await browser.frame();
    const scanned = await result;
    expect(scanned.status).toBe("scanned");
    if (scanned.status !== "scanned")
      throw Error("expected real software decode");
    expect(decodePairingTarget(scanned.text)).toMatchObject(target);
    expect(stopped()).toBe(1);
    expect(browser.providerCalls()).toBe(0);
    expect(browser.overlayCount()).toBe(0);
    expect(browser.frameCount()).toBe(0);
  } finally {
    browser.button("Cancel")?.dispatchEvent(new Event("click"));
    browser.restore();
  }
});

it.each([
  ["NotAllowedError", "camera_permission_denied"],
  ["NotFoundError", "camera_not_found"],
  ["NotReadableError", "camera_unavailable"],
])("%s is a typed failure, not cancellation", async (name, error) => {
  const browser = scannerBrowserBoundary();
  try {
    const result = scanPairingQrWithCamera();
    browser.reject(new DOMException("external media failure", name));
    expect(await result).toEqual({ status: "failed", error });
    expect(browser.overlayCount()).toBe(0);
  } finally {
    browser.restore();
  }
});

it("a blank frame keeps capture usable until the user cancels", async () => {
  const browser = scannerBrowserBoundary();
  try {
    const result = scanPairingQrWithCamera();
    const stopped = browser.acquire();
    await browser.flush();
    browser.button("Scan now").dispatchEvent(new Event("click"));
    await browser.flush();
    expect(browser.overlayCount()).toBe(1);
    expect(browser.button("Scan now").disabled).toBe(false);
    expect(stopped()).toBe(0);
    browser.button("Cancel").dispatchEvent(new Event("click"));
    expect(await result).toEqual({ status: "cancelled" });
    expect(stopped()).toBe(1);
  } finally {
    browser.button("Cancel")?.dispatchEvent(new Event("click"));
    browser.restore();
  }
});

it("a frame-read error settles as typed failure and stops camera/frame work", async () => {
  const browser = scannerBrowserBoundary();
  const result = scanPairingQrWithCamera();
  try {
    const stopped = browser.acquire();
    await browser.flush();
    browser.setImageError(Error("unreadable frame"));
    await browser.frame();
    expect(browser.overlayCount()).toBe(0);
    expect(await result).toEqual({
      status: "failed",
      error: "camera_decode_failed",
    });
    expect(stopped()).toBe(1);
    expect(browser.frameCount()).toBe(0);
  } finally {
    browser.button("Cancel")?.dispatchEvent(new Event("click"));
    browser.restore();
  }
});

it.each(["background", "pagehide"] as const)(
  "%s cancels pending acquisition and resume never reopens it",
  async (event) => {
    const browser = scannerBrowserBoundary();
    const result = scanPairingQrWithCamera();
    try {
      browser[event]();
      await browser.flush();
      expect(browser.overlayCount()).toBe(0);
      expect(await result).toEqual({ status: "cancelled" });
      const stopped = browser.acquire();
      await browser.flush();
      browser.resume();
      expect(stopped()).toBe(1);
      expect(browser.overlayCount()).toBe(0);
      expect(browser.frameCount()).toBe(0);
    } finally {
      browser.button("Cancel")?.dispatchEvent(new Event("click"));
      browser.restore();
    }
  }
);

it("replacement cancels the previous camera operation instead of only removing its overlay", async () => {
  const browser = scannerBrowserBoundary();
  const previous = scanPairingQrWithCamera();
  const oldCancel = browser.button("Cancel");
  try {
    const stopped = browser.acquire();
    await browser.flush();
    const replacement = scanPairingQrWithCamera();
    expect(stopped()).toBe(1);
    expect(await previous).toEqual({ status: "cancelled" });
    expect(browser.overlayCount()).toBe(1);
    const current = new AbortController();
    current.abort();
    await scanPairingQrWithCamera({ signal: current.signal });
    // A pre-aborted call must not acquire or replace the current scan.
    expect(browser.overlayCount()).toBe(1);
    browser.button("Cancel").dispatchEvent(new Event("click"));
    expect(await replacement).toEqual({ status: "cancelled" });
  } finally {
    oldCancel.dispatchEvent(new Event("click"));
    browser.button("Cancel")?.dispatchEvent(new Event("click"));
    browser.restore();
  }
});

it("abort settles while video play is pending and a late play completion cannot schedule capture", async () => {
  const browser = scannerBrowserBoundary();
  let play!: () => void;
  browser.setPlay(
    () =>
      new Promise<void>((resolve) => {
        play = resolve;
      })
  );
  try {
    const controller = new AbortController();
    const result = Reflect.apply(scanPairingQrWithCamera, null, [
      { signal: controller.signal },
    ]);
    const stopped = browser.acquire();
    await browser.flush();
    controller.abort();
    await browser.flush();
    expect(browser.overlayCount()).toBe(0);
    expect(await result).toEqual({ status: "cancelled" });
    play();
    await browser.flush();
    expect(stopped()).toBe(1);
    expect(browser.frameCount()).toBe(0);
  } finally {
    browser.button("Cancel")?.dispatchEvent(new Event("click"));
    browser.restore();
  }
});
