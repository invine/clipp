/* Test-only observation of the maintained public scanner. Never wraps media,
 * decoder, product callbacks or input. The buffer belongs to instrumentation. */
(() => {
  if (globalThis.__clippScannerPublicWitness15)
    throw new Error("Witness already installed");
  const trace = [];
  let dropped = 0;
  let previous = "";
  let frame = { status: "no-ready-public-video" };
  const snapshot = (event) => {
    const overlay = document.getElementById("clipp-android-qr-scanner");
    const state = {
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      overlay: !!overlay,
      alerts: [...document.querySelectorAll('[role="alert"]')]
        .slice(0, 4)
        .map((e) => (e.textContent || "").slice(0, 240)),
    };
    const signature = JSON.stringify(state);
    if (event !== "dom" || signature !== previous) {
      if (trace.length === 256) {
        trace.shift();
        dropped++;
      }
      trace.push({
        event,
        performanceMs: performance.now(),
        timeOriginEpochMs: performance.timeOrigin,
        epochMs: Date.now(),
        ...state,
      });
      previous = signature;
    }
    // One opportunistic copy of pixels already delivered to the real public
    // video. No requestAnimationFrame, delay, resampling or capture retry loop.
    const video = overlay?.querySelector("video");
    if (
      frame.status !== "no-ready-public-video" ||
      !video ||
      video.readyState < 2
    )
      return;
    const width = video.videoWidth,
      height = video.videoHeight;
    if (!width || !height) return;
    if (Math.max(width, height) > 1920 || Math.min(width, height) > 1080) {
      frame = { status: "unqualified-dimensions", width, height };
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("CanvasUnavailable");
      context.drawImage(video, 0, 0);
      const data = canvas.toDataURL("image/png");
      if (!data.startsWith("data:image/png;base64,"))
        throw new Error("PngUnavailable");
      const base64 = data.slice("data:image/png;base64,".length);
      const bytes =
        (base64.length * 3) / 4 -
        (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
      frame =
        bytes > 4 * 1024 * 1024
          ? { status: "unqualified-png-bytes", width, height, bytes }
          : {
              status: "captured",
              width,
              height,
              bytes,
              base64,
              performanceMs: performance.now(),
              epochMs: Date.now(),
            };
    } catch (error) {
      frame = { status: "unavailable", width, height, errorName: error.name };
    }
  };
  const dom = () => snapshot("dom");
  const visibility = () => snapshot("visibilitychange");
  const pagehide = () => snapshot("pagehide");
  const focus = () => snapshot("focus");
  const blur = () => snapshot("blur");
  const media = () => snapshot("dom");
  const observer = new MutationObserver(dom);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["role", "hidden", "aria-hidden"],
  });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("focus", focus);
  window.addEventListener("blur", blur);
  for (const event of ["loadeddata", "canplay", "timeupdate"])
    document.addEventListener(event, media, true);
  globalThis.__clippScannerPublicWitness15 = {
    read: () => ({ trace: trace.slice(), dropped, frame }),
    stop: () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      for (const event of ["loadeddata", "canplay", "timeupdate"])
        document.removeEventListener(event, media, true);
    },
  };
  snapshot("installed");
  return {
    performanceMs: performance.now(),
    timeOriginEpochMs: performance.timeOrigin,
  };
})();
