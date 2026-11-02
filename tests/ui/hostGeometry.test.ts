import {
  contentBoundsInCssPixels,
  observeHostGeometry,
  type HostGeometrySnapshot,
  type NativeGeometrySource,
} from "../../packages/ui/src/hostGeometry";

const edgeToEdge: HostGeometrySnapshot = {
  sequence: 1,
  windowPx: { left: 0, top: 0, width: 1080, height: 1920 },
  webViewPx: { left: 0, top: 0, width: 1080, height: 1920 },
  safeAreaPx: { left: 0, top: 63, width: 1080, height: 1731 },
  systemBarsPx: { left: 0, top: 63, right: 0, bottom: 126 },
  cutoutPx: { left: 0, top: 0, right: 0, bottom: 0 },
  imePx: { left: 0, top: 0, right: 0, bottom: 0 },
  density: 2.625,
  fontScale: 1,
  textZoomPercent: 100,
  imeVisible: false,
};

it("exposes bars in CSS pixels using the measured WebView scale, independently of dp density", () => {
  expect(contentBoundsInCssPixels(edgeToEdge, 360)).toEqual({
    left: 0,
    top: 21,
    width: 360,
    height: 577,
  });
});

it("reserves only occlusion intersecting a WebView already fitted by Android", () => {
  expect(
    contentBoundsInCssPixels(
      {
        ...edgeToEdge,
        webViewPx: { left: 0, top: 63, width: 1080, height: 1731 },
      },
      360
    )
  ).toEqual({ left: 0, top: 0, width: 360, height: 577 });
});

it("does not reserve an IME again when the WebView has already resized above it", () => {
  expect(
    contentBoundsInCssPixels(
      {
        ...edgeToEdge,
        safeAreaPx: { left: 0, top: 63, width: 1080, height: 900 },
        webViewPx: { left: 0, top: 63, width: 1080, height: 900 },
        imePx: { left: 0, top: 0, right: 0, bottom: 957 },
        imeVisible: true,
      },
      360
    )
  ).toEqual({ left: 0, top: 0, width: 360, height: 300 });
});

it("keeps the newest native geometry when the initial request resolves after an inset update", async () => {
  let update: (snapshot: HostGeometrySnapshot) => void = () => undefined;
  let resolveInitial: (snapshot: HostGeometrySnapshot) => void = () =>
    undefined;
  const source: NativeGeometrySource = {
    getSnapshot: () =>
      new Promise((resolve) => {
        resolveInitial = resolve;
      }),
    addListener: async (callback) => {
      update = callback;
      return { remove() {} };
    },
  };
  const seen: number[] = [];
  const dispose = observeHostGeometry(source, (snapshot) =>
    seen.push(snapshot.sequence)
  );
  await Promise.resolve();
  update({ ...edgeToEdge, sequence: 2 });
  resolveInitial(edgeToEdge);
  await Promise.resolve();
  expect(seen).toEqual([2]);
  dispose();
});

it("disposes a late native registration and rejects updates after the document owner closes", async () => {
  let registered: (handle: { remove(): void }) => void = () => undefined;
  let update: (snapshot: HostGeometrySnapshot) => void = () => undefined;
  let removed = false;
  const seen: number[] = [];
  const dispose = observeHostGeometry(
    {
      getSnapshot: async () => edgeToEdge,
      addListener: (callback) => {
        update = callback;
        return new Promise((resolve) => {
          registered = resolve;
        });
      },
    },
    (snapshot) => seen.push(snapshot.sequence)
  );
  dispose();
  registered({
    remove() {
      removed = true;
    },
  });
  update(edgeToEdge);
  await Promise.resolve();
  expect({ removed, seen }).toEqual({ removed: true, seen: [] });
});

it("uses a side cutout and top reservation without reducing text size or equating density with CSS scale", () => {
  expect(
    contentBoundsInCssPixels(
      {
        ...edgeToEdge,
        windowPx: { left: 120, top: 80, width: 1920, height: 1080 },
        webViewPx: { left: 120, top: 80, width: 1920, height: 1080 },
        safeAreaPx: { left: 210, top: 140, width: 1734, height: 1020 },
        density: 3,
        fontScale: 2,
      },
      960
    )
  ).toEqual({ left: 45, top: 30, width: 867, height: 510 });
});

it("keeps valid bounds after malformed or stale native updates", async () => {
  let update: (snapshot: HostGeometrySnapshot) => void = () => undefined;
  const seen: number[] = [];
  const dispose = observeHostGeometry(
    {
      getSnapshot: async () => edgeToEdge,
      addListener: async (callback) => {
        update = callback;
        return { remove() {} };
      },
    },
    (snapshot) => seen.push(snapshot.sequence)
  );
  await Promise.resolve();
  update({
    ...edgeToEdge,
    sequence: 3,
    safeAreaPx: { left: 0, top: 0, width: NaN, height: 10 },
  });
  update({ ...edgeToEdge, sequence: 2 });
  update(edgeToEdge);
  expect(seen).toEqual([1, 2]);
  dispose();
});

it("lets a user keep the task's last action in view when Android repeats unchanged geometry", async () => {
  let update: (snapshot: HostGeometrySnapshot) => void = () => undefined;
  let viewedControl = "focused-field";
  class Input {
    matches() {
      return true;
    }
    scrollIntoView() {
      viewedControl = "focused-field";
    }
  }
  const originalElement = globalThis.HTMLElement;
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: Input,
  });
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  const flush = () => {
    for (const [key, callback] of frames) {
      frames.delete(key);
      callback(0);
    }
  };
  const values = new Map<string, string>();
  const win = {
    innerWidth: 360,
    innerHeight: 640,
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.set(++id, callback);
      return id;
    },
    cancelAnimationFrame(key: number) {
      frames.delete(key);
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  } as unknown as Window;
  const doc = {
    activeElement: new Input(),
    documentElement: {
      dataset: {},
      getBoundingClientRect() {
        return { width: 360 };
      },
      style: {
        setProperty(key: string, value: string) {
          values.set(key, value);
        },
        getPropertyValue(key: string) {
          return values.get(key) ?? "";
        },
        removeProperty(key: string) {
          values.delete(key);
        },
      },
    },
    addEventListener() {},
    removeEventListener() {},
  } as unknown as Document;
  const { bindHostGeometry } =
    await import("../../packages/ui/src/hostGeometry");
  const dispose = bindHostGeometry(
    {
      getSnapshot: async () => edgeToEdge,
      addListener: async (callback) => {
        update = callback;
        return { remove() {} };
      },
    },
    win,
    doc
  );
  try {
    await Promise.resolve();
    flush();
    viewedControl = "last-action"; // The user scrolls within the task after focus reveal.
    update({ ...edgeToEdge, sequence: 2 });
    flush();
    expect(viewedControl).toBe("last-action");
  } finally {
    dispose();
    if (originalElement)
      Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: originalElement,
      });
    else Reflect.deleteProperty(globalThis, "HTMLElement");
  }
});
