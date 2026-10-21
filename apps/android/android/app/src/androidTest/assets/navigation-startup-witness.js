/* Test-owned passive startup navigation timeline. No DOM actions or product hooks. */
(() => {
  const key = "__clippNavigationStartupWitness19";
  if (Object.hasOwn(globalThis, key))
    throw new Error("Witness already installed");
  const navSelector = 'nav[aria-label="Clipp destinations"]';
  const labels = new Set([
    "History",
    "Devices",
    "Requests",
    "Requests (loading)",
    "Requests (unavailable)",
    "Settings",
  ]);
  const statusLabels = new Set([
    "Loading History…",
    "History unavailable.",
    "History refresh failed. Showing last known Clips.",
    "Requests are unavailable. Retry to refresh the current list.",
    "Requests are unavailable until this installation is ready.",
  ]);
  const trace = [];
  const started = performance.now();
  const encoder = new TextEncoder();
  let bytes = 0,
    dropped = 0,
    stopped = false,
    truncated = false,
    expired = false,
    collectorFailed = false;
  let reason = "observing",
    previous = "",
    inputSeen = false,
    frame,
    timer,
    stoppedAt;
  let observer;
  const listeners = [];
  const rect = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const name = (e) => {
    if (!e) return null;
    const text = e.textContent.trim();
    if (labels.has(text)) return text;
    // Request counts are public availability, never arbitrary text.
    return /^Requests\s*\(\d{1,4}\)$/.test(text) ? text : "other-label";
  };
  const target = (value) => {
    const e = value instanceof Element ? value : null;
    const button = e?.closest(`${navSelector} button`);
    return { tag: e?.tagName?.slice(0, 16) || null, nav: name(button) };
  };
  const metrics = (e) => {
    if (!e) return null;
    const style = getComputedStyle(e);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontFamily: style.fontFamily.slice(0, 120),
      fontWeight: style.fontWeight,
    };
  };
  const initial = document.querySelector(
    `${navSelector} button[aria-current="page"]`
  );
  const initialCurrent = name(initial);
  const state = () => {
    const nav = document.querySelector(navSelector);
    const buttons = [...(nav?.querySelectorAll("button") || [])].slice(0, 4);
    const devices = buttons.find((e) => name(e) === "Devices");
    const r = devices?.getBoundingClientRect();
    const x = r ? r.x + r.width / 2 : null,
      y = r ? r.y + r.height / 2 : null;
    const root = document.documentElement;
    const shell = document.querySelector(".app-shell");
    const shellClasses = [
      "app-shell",
      "workspace-narrow",
      "workspace-wide",
      "workspace-cramped",
      "app-shell-with-initialization-error",
    ].filter((c) => shell?.classList.contains(c));
    const publicStatuses = [
      ...document.querySelectorAll(
        '.initialization-error > span, p[role="status"], .destination-pane [role="alert"]'
      ),
    ]
      .slice(0, 16)
      .map((e) => e.textContent.trim())
      .filter((s) => statusLabels.has(s));
    return {
      nav: buttons.map((e) => ({
        label: name(e),
        current: e.getAttribute("aria-current") === "page",
        disabled: e.disabled,
        rect: rect(e),
        text: metrics(e),
      })),
      intended: {
        x,
        y,
        hit: x === null ? null : target(document.elementFromPoint(x, y)),
      },
      navRect: rect(nav),
      shell: { classes: shellClasses, rect: rect(shell) },
      host: {
        geometry: root.dataset.hostGeometry === "android" ? "android" : "other",
        rect: rect(root),
        text: metrics(root),
        fonts: document.fonts.status,
        cssBounds: Object.fromEntries(
          [
            "--clipp-target-min",
            "--clipp-content-left",
            "--clipp-content-top",
            "--clipp-content-width",
            "--clipp-content-height",
          ].map((key) => [
            key,
            getComputedStyle(root).getPropertyValue(key).slice(0, 40),
          ])
        ),
      },
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        visual: visualViewport
          ? {
              width: visualViewport.width,
              height: visualViewport.height,
              scale: visualViewport.scale,
              offsetLeft: visualViewport.offsetLeft,
              offsetTop: visualViewport.offsetTop,
            }
          : null,
      },
      scroll: {
        x: scrollX,
        y: scrollY,
        panes: [...document.querySelectorAll("[data-session-scroll]")]
          .slice(0, 4)
          .map((e) => ({
            destination: labels.has(
              (e.getAttribute("data-session-scroll") || "").replace(/^./, (c) =>
                c.toUpperCase()
              )
            )
              ? e.getAttribute("data-session-scroll")
              : "other",
            x: e.scrollLeft,
            y: e.scrollTop,
            rect: rect(e),
          })),
      },
      statuses: [...new Set(publicStatuses)].slice(0, 5),
      current: name(
        document.querySelector(`${navSelector} button[aria-current="page"]`)
      ),
    };
  };
  const retire = (cleanup) => {
    try {
      cleanup();
    } catch {
      collectorFailed = true;
    }
  };
  const stop = (why) => {
    if (stopped) return;
    stopped = true;
    reason = why;
    stoppedAt = performance.now();
    retire(() => observer?.disconnect());
    retire(() => cancelAnimationFrame(frame));
    retire(() => clearTimeout(timer));
    for (const [owner, type, callback] of listeners)
      retire(() => owner.removeEventListener(type, callback, true));
    listeners.length = 0;
  };
  const expireIfLate = () => {
    if (!stopped && performance.now() - started > 25_000) {
      expired = true;
      stop("duration-cap");
    }
    return expired;
  };
  const guard =
    (callback) =>
    (...args) => {
      if (stopped || expireIfLate()) return;
      try {
        return callback(...args);
      } catch {
        collectorFailed = true;
        stop("collector-failure");
      }
    };
  const sample = (event, details) => {
    if (stopped || expireIfLate()) return;
    const current = state(),
      signature = JSON.stringify(current);
    if (expireIfLate()) return;
    if (event === "layout" && signature === previous) return;
    const entry = {
      event,
      performanceMs: performance.now(),
      epochMs: Date.now(),
      ...(details ? { input: details } : {}),
      ...current,
    };
    const size = encoder.encode(JSON.stringify(entry)).length;
    if (expireIfLate()) return;
    if (trace.length >= 160 || bytes + size > 100 * 1024) {
      dropped++;
      truncated = true;
      stop("sample-or-byte-cap");
      return;
    }
    bytes += size;
    trace.push(entry);
    previous = signature;
    if (inputSeen && current.current && current.current !== initialCurrent)
      stop("selection-observed");
  };

  const listen = (owner, type, callback) => {
    const guarded = guard(callback);
    owner.addEventListener(type, guarded, { capture: true, passive: true });
    listeners.push([owner, type, guarded]);
  };
  const input = (e) => {
    inputSeen = true;
    const point = e.changedTouches?.[0] || e;
    const x = Number.isFinite(point.clientX) ? point.clientX : null;
    const y = Number.isFinite(point.clientY) ? point.clientY : null;
    sample(e.type, {
      eventTimeStamp: e.timeStamp,
      trusted: e.isTrusted,
      target: target(e.target),
      clientX: x,
      clientY: y,
      hit: x === null ? null : target(document.elementFromPoint(x, y)),
      pointerType: ["touch", "mouse", "pen"].includes(e.pointerType)
        ? e.pointerType
        : null,
    });
  };
  try {
    observer = new MutationObserver(guard(() => sample("layout")));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-current", "class", "style", "hidden", "disabled"],
    });
    for (const type of [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "touchstart",
      "touchend",
      "touchcancel",
      "click",
    ])
      listen(document, type, input);
    listen(document, "scroll", () => sample("scroll"));
    listen(window, "resize", () => sample("resize"));
    listen(window, "pagehide", () => {
      sample("pagehide");
      stop("pagehide");
    });
    const tick = guard(() => {
      if (!stopped) {
        sample("layout");
        if (!stopped) frame = requestAnimationFrame(tick);
      }
    });
    globalThis[key] = {
      read: () => {
        expireIfLate();
        return {
          trace: trace.slice(),
          dropped,
          truncated,
          expired,
          collectorFailed,
          stopped,
          reason,
          bytes,
          durationMs: (stoppedAt ?? performance.now()) - started,
          timeOriginEpochMs: performance.timeOrigin,
        };
      },
      stop: () => stop("finally-uninstall"),
    };
    timer = setTimeout(
      guard(() => {
        sample("deadline");
        stop("duration-cap");
      }),
      25_000
    );
    sample("installed");
    frame = requestAnimationFrame(tick);
    return {
      performanceMs: performance.now(),
      timeOriginEpochMs: performance.timeOrigin,
      epochMs: Date.now(),
    };
  } catch (error) {
    stop("installation-failed");
    delete globalThis[key];
    throw error;
  }
})();
