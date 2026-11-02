jest.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
  registerPlugin: () => ({}),
}));
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import { createAndroidPairingScanner } from "../../apps/android/src/pairingScannerHost";
import { createHostTaskInput } from "../../packages/ui/src/hostTaskInput";
import { createUiSession } from "../../packages/ui/src/uiSession";
import { scannerBrowserBoundary } from "./scannerBrowserBoundary";

it("real host Back cancels capture and preserves its Pairing parent/draft until the next Back", async () => {
  const browser = scannerBrowserBoundary();
  const session = createUiSession();
  session.open({ kind: "pairing", origin: "add-device" });
  session.pairing.change("retained parent");
  const input = createHostTaskInput(session);
  input.setReady(true);
  const host = createAndroidPairingScanner(input, { on: async () => () => {} });
  const signal = new AbortController();
  try {
    const result = host.scan({ signal: signal.signal });
    await browser.flush();
    const stopped = browser.acquire();
    await browser.flush();
    expect(await input.back({ sequence: 1, imeVisible: true })).toBe("ime");
    expect(stopped()).toBe(0);
    expect(await input.back({ sequence: 2, imeVisible: false })).toBe(
      "overlay"
    );
    expect(browser.overlayCount()).toBe(0);
    expect(await result).toEqual({ status: "cancelled" });
    expect(stopped()).toBe(1);
    expect(session.getSnapshot().tasks.map((t) => t.kind)).toEqual(["pairing"]);
    expect(session.pairing.getSnapshot().raw).toBe("retained parent");
    expect(await input.back({ sequence: 3, imeVisible: false })).toBe("task");
  } finally {
    signal.abort();
    host.dispose();
    browser.restore();
  }
});

it("native background aborts but permission-dialog focus loss does not; resume does not reopen", async () => {
  const browser = scannerBrowserBoundary();
  const input = createHostTaskInput(createUiSession());
  let activity!: (event: Record<string, unknown>) => void;
  let removed = 0;
  const host = createAndroidPairingScanner(input, {
    on: async (_name, callback) => {
      activity = callback;
      return () => {
        removed++;
      };
    },
  });
  try {
    const result = host.scan({ signal: new AbortController().signal });
    await browser.flush();
    const stopped = browser.acquire();
    await browser.flush();
    activity({ resumed: true, windowFocused: false });
    expect(stopped()).toBe(0);
    expect(browser.overlayCount()).toBe(1);
    activity({ resumed: false, windowFocused: false });
    expect(await result).toEqual({ status: "cancelled" });
    activity({ resumed: true, windowFocused: true });
    expect(stopped()).toBe(1);
    expect(removed).toBe(1);
    expect(input.hasOverlay()).toBe(false);
    expect(browser.overlayCount()).toBe(0);
  } finally {
    host.dispose();
    browser.restore();
  }
});

it("disposal settles before delayed native subscription and removes its late listener", async () => {
  const browser = scannerBrowserBoundary();
  let register!: (remove: () => void) => void;
  let removed = 0;
  const input = createHostTaskInput(createUiSession());
  const host = createAndroidPairingScanner(input, {
    on: () =>
      new Promise((resolve) => {
        register = resolve;
      }),
  });
  try {
    const result = host.scan({ signal: new AbortController().signal });
    host.dispose();
    expect(await result).toEqual({ status: "cancelled" });
    register(() => {
      removed++;
    });
    await browser.flush();
    expect(removed).toBe(1);
    expect(browser.overlayCount()).toBe(0);
    expect(input.hasOverlay()).toBe(false);
    expect(await host.scan({ signal: new AbortController().signal })).toEqual({
      status: "cancelled",
    });
  } finally {
    host.dispose();
    browser.restore();
  }
});

it("replacement releases only the aborted scan's registration and native subscription", async () => {
  const browser = scannerBrowserBoundary();
  let removed = 0;
  const input = createHostTaskInput(createUiSession());
  const host = createAndroidPairingScanner(input, {
    on: async () => () => {
      removed++;
    },
  });
  const controller = new AbortController();
  try {
    const previous = host.scan({ signal: new AbortController().signal });
    await browser.flush();
    const stopped = browser.acquire();
    await browser.flush();
    const next = host.scan({ signal: controller.signal });
    expect(await previous).toEqual({ status: "cancelled" });
    await browser.flush();
    expect(stopped()).toBe(1);
    expect(input.hasOverlay()).toBe(true);
    controller.abort();
    expect(await next).toEqual({ status: "cancelled" });
    expect(input.hasOverlay()).toBe(false);
    expect(removed).toBe(2);
  } finally {
    controller.abort();
    host.dispose();
    browser.restore();
  }
});

it("captured native STARTED permission pause retains acquisition until typed denial, independently of focus", async () => {
  const browser = scannerBrowserBoundary();
  let activity!: (event: Record<string, unknown>) => void;
  const input = createHostTaskInput(createUiSession());
  const host = createAndroidPairingScanner(input, {
    on: async (_event, callback) => {
      activity = callback;
      return () => {};
    },
  });
  try {
    const result = host.scan({ signal: new AbortController().signal });
    await browser.flush();
    // Actual a270 witness: paused while STARTED/visible, then focus lost;
    // a permission rejection is controlled at the external media seam only.
    activity({ started: true, resumed: false, windowFocused: true });
    activity({ started: true, resumed: false, windowFocused: false });
    await browser.flush();
    expect(browser.overlayCount()).toBe(1);
    expect(input.hasOverlay()).toBe(true);
    browser.reject(new DOMException("permission denied", "NotAllowedError"));
    expect(await result).toEqual({
      status: "failed",
      error: "camera_permission_denied",
    });
    expect(browser.overlayCount()).toBe(0);
    expect(input.hasOverlay()).toBe(false);
  } finally {
    host.dispose();
    browser.restore();
  }
});

it("native Stop during acquisition cancels promptly, disposes a late stream, and never reopens on Start/Resume", async () => {
  const browser = scannerBrowserBoundary();
  let activity!: (event: Record<string, unknown>) => void;
  const host = createAndroidPairingScanner(
    createHostTaskInput(createUiSession()),
    {
      on: async (_event, callback) => {
        activity = callback;
        return () => {};
      },
    }
  );
  try {
    const result = host.scan({ signal: new AbortController().signal });
    await browser.flush();
    activity({ started: true, resumed: false, windowFocused: false });
    activity({ started: false, resumed: false, windowFocused: false });
    expect(await result).toEqual({ status: "cancelled" });
    const stopped = browser.acquire();
    await browser.flush();
    expect(stopped()).toBe(1);
    activity({ started: true, resumed: false, windowFocused: false });
    activity({ started: true, resumed: true, windowFocused: true });
    await browser.flush();
    expect(browser.overlayCount()).toBe(0);
    expect(browser.frameCount()).toBe(0);
  } finally {
    host.dispose();
    browser.restore();
  }
});

it("a retained initial STARTED-but-paused event during listener registration does not pre-cancel permission acquisition", async () => {
  const browser = scannerBrowserBoundary();
  const host = createAndroidPairingScanner(
    createHostTaskInput(createUiSession()),
    {
      on: async (_event, callback) => {
        callback({ started: true, resumed: false, windowFocused: false });
        return () => {};
      },
    }
  );
  try {
    const result = host.scan({ signal: new AbortController().signal });
    await browser.flush();
    expect(browser.overlayCount()).toBe(1);
    browser.reject(new DOMException("permission denied", "NotAllowedError"));
    expect(await result).toEqual({
      status: "failed",
      error: "camera_permission_denied",
    });
  } finally {
    host.dispose();
    browser.restore();
  }
});
