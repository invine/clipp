import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { PNG } from "pngjs";

function syntheticPng(width: number, height: number) {
  const pixels = new PNG({ width, height });
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    pixels.data[offset] = 255;
    pixels.data[offset + 3] = 128;
  }
  return "data:image/png;base64," + PNG.sync.write(pixels).toString("base64");
}
const landscapePng = syntheticPng(640, 480);

function publicWitness(encodedOverride?: string) {
  const encoded = encodedOverride ?? landscapePng;
  let mutation = () => {};
  let overlay = false;
  let alerts: string[] = [];
  let now = 0;
  const draw: unknown[][] = [];
  const video = { readyState: 0, videoWidth: 640, videoHeight: 480 };
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    documentElement: {},
    hasFocus: () => true,
    getElementById: () => (overlay ? { querySelector: () => video } : null),
    querySelectorAll: () => alerts.map((textContent) => ({ textContent })),
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args: unknown[]) => draw.push(args),
      }),
      toDataURL: () => encoded,
    }),
  });
  const window = new EventTarget();
  const context = {
    document,
    window,
    performance: { now: () => ++now, timeOrigin: 1000 },
    MutationObserver: class {
      constructor(callback: () => void) {
        mutation = callback;
      }
      observe() {}
      disconnect() {
        mutation = () => {};
      }
    },
  };
  const source = readFileSync(
    join(
      process.cwd(),
      "apps/android/android/app/src/androidTest/assets/scanner-public-witness.js"
    ),
    "utf8"
  );
  runInNewContext(source, context);
  const witness: {
    read: () => {
      trace: {
        event: string;
        overlay: boolean;
        alerts: string[];
        visibility: string;
      }[];
      dropped: number;
      frame: {
        status: string;
        width?: number;
        height?: number;
        base64?: string;
      };
    };
    stop: () => void;
  } = runInNewContext("globalThis.__clippScannerPublicWitness15", context);
  return {
    document,
    window,
    video,
    draw,
    witness,
    update(visible: boolean, messages: string[] = []) {
      overlay = visible;
      alerts = messages;
      mutation();
    },
  };
}

it("retains public visibility/pagehide and silent overlay disappearance in its own trace", () => {
  const page = publicWitness();
  page.update(true);
  page.document.visibilityState = "hidden";
  page.document.dispatchEvent(new Event("visibilitychange"));
  page.window.dispatchEvent(new Event("pagehide"));
  page.update(false);
  const trace = page.witness.read().trace;
  expect(trace.map((e) => [e.event, e.overlay, e.visibility])).toEqual([
    ["installed", false, "visible"],
    ["dom", true, "visible"],
    ["visibilitychange", true, "hidden"],
    ["pagehide", true, "hidden"],
    ["dom", false, "hidden"],
  ]);
  expect(page.draw).toHaveLength(0);
});

it("records public denial and recovery alerts without reading other product content", () => {
  const page = publicWitness();
  page.update(true);
  page.update(false, [
    "Camera permission is required. Paste pairing text instead.",
  ]);
  page.update(false, ["Camera permission is now allowed. Retry to scan."]);
  expect(
    page.witness
      .read()
      .trace.slice(-2)
      .map((e) => e.alerts)
  ).toEqual([
    ["Camera permission is required. Paste pairing text instead."],
    ["Camera permission is now allowed. Retry to scan."],
  ]);
});

it("copies one actual ready video frame at its intrinsic dimensions without transformation", () => {
  const page = publicWitness();
  page.update(true);
  page.video.readyState = 2;
  page.document.dispatchEvent(new Event("loadeddata"));
  page.document.dispatchEvent(new Event("timeupdate"));
  expect(page.draw).toEqual([[page.video, 0, 0]]);
  const frame = page.witness.read().frame;
  expect(frame).toMatchObject({ status: "captured", width: 640, height: 480 });
  const decoded = PNG.sync.read(Buffer.from(frame.base64!, "base64"));
  expect([decoded.width, decoded.height]).toEqual([640, 480]);
  expect([...decoded.data.subarray(0, 4)]).toEqual([255, 0, 0, 128]);
  expect([...decoded.data.subarray(-4)]).toEqual([255, 0, 0, 128]);
});

it("explicitly withholds oversized frames instead of resizing them", () => {
  const page = publicWitness();
  page.video.readyState = 2;
  page.video.videoWidth = 1921;
  page.update(true);
  expect(page.draw).toHaveLength(0);
  expect(page.witness.read().frame).toEqual({
    status: "unqualified-dimensions",
    width: 1921,
    height: 480,
  });
});

it("bounds trace volume, keeps a dropped count, and disconnects on stop", () => {
  const page = publicWitness();
  for (let i = 0; i < 300; i++) page.update(i % 2 === 0);
  const before = page.witness.read();
  expect(before.trace).toHaveLength(256);
  expect(before.dropped).toBeGreaterThan(0);
  page.witness.stop();
  page.update(true, ["must not be recorded after stop"]);
  expect(page.witness.read()).toEqual(before);
});

it("withholds a PNG above the byte cap and still records later denial", () => {
  const page = publicWitness(
    "data:image/png;base64," +
      "A".repeat(4 * Math.ceil((4 * 1024 * 1024 + 1) / 3))
  );
  page.video.readyState = 2;
  page.update(true);
  expect(page.witness.read().frame).toMatchObject({
    status: "unqualified-png-bytes",
    width: 640,
    height: 480,
  });
  expect(page.witness.read().frame.base64).toBeUndefined();
  page.update(false, ["Camera permission is required"]);
  expect(page.witness.read().trace.slice(-1)[0].alerts).toEqual([
    "Camera permission is required",
  ]);
});

it("leaves a fast disappearing scanner explicitly without a fabricated video frame", () => {
  const page = publicWitness();
  page.update(true);
  page.update(false);
  page.video.readyState = 2;
  page.document.dispatchEvent(new Event("loadeddata"));
  expect(page.draw).toHaveLength(0);
  expect(page.witness.read().frame.status).toBe("no-ready-public-video");
});

it("preserves a delivered 720 by 1280 portrait frame without rotation or rescaling", () => {
  const page = publicWitness(syntheticPng(720, 1280));
  page.video.videoWidth = 720;
  page.video.videoHeight = 1280;
  page.video.readyState = 2;
  page.update(true);
  const frame = page.witness.read().frame;
  expect(frame).toMatchObject({ status: "captured", width: 720, height: 1280 });
  expect(page.draw).toEqual([[page.video, 0, 0]]);
  const pixels = PNG.sync.read(Buffer.from(frame.base64!, "base64"));
  expect([pixels.width, pixels.height]).toEqual([720, 1280]);
  expect([...pixels.data.subarray(0, 4)]).toEqual([255, 0, 0, 128]);
});

it.each([
  [1920, 1080],
  [1080, 1920],
])("accepts exact frame edge bounds %i by %i", (width, height) => {
  const page = publicWitness();
  Object.assign(page.video, {
    videoWidth: width,
    videoHeight: height,
    readyState: 2,
  });
  page.update(true);
  expect(page.witness.read().frame).toMatchObject({
    status: "captured",
    width,
    height,
  });
});

it.each([
  [1081, 1920],
  [1920, 1081],
  [1921, 720],
  [720, 1921],
])("withholds excess edge bounds %i by %i", (width, height) => {
  const page = publicWitness();
  Object.assign(page.video, {
    videoWidth: width,
    videoHeight: height,
    readyState: 2,
  });
  page.update(true);
  expect(page.witness.read().frame.status).toBe("unqualified-dimensions");
  expect(page.draw).toHaveLength(0);
});
