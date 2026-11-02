/** All native rectangles use physical pixels in screen coordinates. dp is px / density;
 * renderer CSS pixels use the measured WebView-width / CSS-viewport-width ratio. */
export type PhysicalRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type PhysicalInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type ContentBounds = PhysicalRect;
export type HostGeometrySnapshot = {
  sequence: number;
  windowPx: PhysicalRect;
  webViewPx: PhysicalRect;
  safeAreaPx: PhysicalRect;
  systemBarsPx: PhysicalInsets;
  cutoutPx: PhysicalInsets;
  imePx: PhysicalInsets;
  density: number;
  fontScale: number;
  /** Measured WebView text setting; the native activity alone applies it. */
  textZoomPercent: number;
  imeVisible: boolean;
};
export type NativeGeometrySource = {
  getSnapshot(): Promise<HostGeometrySnapshot>;
  addListener(
    callback: (snapshot: HostGeometrySnapshot) => void
  ): Promise<{ remove(): void | Promise<void> }>;
};

export function contentBoundsInCssPixels(
  snapshot: HostGeometrySnapshot,
  cssViewportWidth: number
): ContentBounds | null {
  const { webViewPx: view, safeAreaPx: safe } = snapshot;
  if (
    ![
      view.left,
      view.top,
      view.width,
      view.height,
      safe.left,
      safe.top,
      safe.width,
      safe.height,
      cssViewportWidth,
    ].every(Number.isFinite) ||
    view.width <= 0 ||
    view.height <= 0 ||
    safe.width <= 0 ||
    safe.height <= 0 ||
    cssViewportWidth <= 0
  )
    return null;
  const left = Math.max(view.left, safe.left),
    top = Math.max(view.top, safe.top);
  const right = Math.min(view.left + view.width, safe.left + safe.width);
  const bottom = Math.min(view.top + view.height, safe.top + safe.height);
  if (right <= left || bottom <= top) return null;
  const pxPerCssPixel = view.width / cssViewportWidth;
  return {
    left: (left - view.left) / pxPerCssPixel,
    top: (top - view.top) / pxPerCssPixel,
    width: (right - left) / pxPerCssPixel,
    height: (bottom - top) / pxPerCssPixel,
  };
}

/** Subscribe before requesting the initial measurement; a delayed reply cannot roll back
 * a later inset event. Document disposal also owns late listener registration. */
export function observeHostGeometry(
  source: NativeGeometrySource,
  changed: (snapshot: HostGeometrySnapshot) => void
): () => void {
  let disposed = false,
    sequence = -1;
  let listener: { remove(): void | Promise<void> } | undefined;
  const accept = (snapshot: HostGeometrySnapshot) => {
    if (
      disposed ||
      !Number.isSafeInteger(snapshot.sequence) ||
      snapshot.sequence <= sequence ||
      !contentBoundsInCssPixels(snapshot, 1)
    )
      return;
    sequence = snapshot.sequence;
    changed(snapshot);
  };
  void source
    .addListener(accept)
    .then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    })
    .catch(() => undefined);
  void source
    .getSnapshot()
    .then(accept)
    .catch(() => undefined);
  return () => {
    disposed = true;
    void listener?.remove();
  };
}

export const HOST_GEOMETRY_EVENT = "clipp:host-geometry";

/** Existing presentation reads this without creating an application/session store. */
export function hostContentSize(
  win: Window,
  doc: Document
): { width: number; height: number } {
  const styles = doc.documentElement.style;
  const width = parseFloat(styles.getPropertyValue("--clipp-content-width"));
  const height = parseFloat(styles.getPropertyValue("--clipp-content-height"));
  return {
    width: Number.isFinite(width) ? width : win.innerWidth,
    height: Number.isFinite(height) ? height : win.innerHeight,
  };
}

/** One document binding feeds shell and fixed task/scanner surfaces through CSS variables.
 * Native resize is accounted for by the measured intersection, never an extra JS keyboard offset. */
export function bindHostGeometry(
  source: NativeGeometrySource,
  win: Window,
  doc: Document
): () => void {
  const priorTarget =
    doc.documentElement.style.getPropertyValue("--clipp-target-min");
  let snapshot: HostGeometrySnapshot | undefined;
  let frame = 0;
  let applied: ContentBounds | undefined;
  const revealFocus = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      const element = doc.activeElement;
      if (
        element instanceof HTMLElement &&
        element.matches("input, textarea, select, [contenteditable=true]")
      ) {
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
  };
  const apply = () => {
    if (!snapshot) return;
    // Floating root bounds retain subpixel CSS viewport precision; innerWidth rounds on WebView.
    const cssWidth =
      doc.documentElement.getBoundingClientRect().width || win.innerWidth;
    const bounds = contentBoundsInCssPixels(snapshot, cssWidth);
    if (!bounds) return;
    // One native measurement owns both content and target units. dp is physical px /
    // density; CSS uses the measured WebView ratio, never DPR or an assumed 1:1 dp.
    const pxPerCssPixel = snapshot.webViewPx.width / cssWidth;
    // Round the converted lower bound upward: browser layout can truncate
    // fractional CSS lengths, which must not shrink the 48dp target intent.
    const target =
      Number.isFinite(snapshot.density) && snapshot.density > 0
        ? Math.ceil(Math.max(40, (48 * snapshot.density) / pxPerCssPixel))
        : 40;
    doc.documentElement.style.setProperty("--clipp-target-min", `${target}px`);
    // Native layout can repeat while a user scrolls the task. Reveal focus only
    // when usable geometry changes, so it cannot pull the last action out of view.
    if (
      applied &&
      Object.entries(bounds).every(
        ([key, value]) =>
          Math.abs(value - applied![key as keyof ContentBounds]) < 0.01
      )
    )
      return;
    applied = bounds;
    for (const [key, value] of Object.entries(bounds))
      doc.documentElement.style.setProperty(
        `--clipp-content-${key}`,
        `${value}px`
      );
    doc.documentElement.dataset.hostGeometry = "android";
    win.dispatchEvent(new Event(HOST_GEOMETRY_EVENT));
    revealFocus();
  };
  const stop = observeHostGeometry(source, (next) => {
    snapshot = next;
    apply();
  });
  win.addEventListener("resize", apply);
  doc.addEventListener("focusin", revealFocus);
  return () => {
    stop();
    win.removeEventListener("resize", apply);
    doc.removeEventListener("focusin", revealFocus);
    if (frame) win.cancelAnimationFrame(frame);
    delete doc.documentElement.dataset.hostGeometry;
    if (priorTarget)
      doc.documentElement.style.setProperty("--clipp-target-min", priorTarget);
    else doc.documentElement.style.removeProperty("--clipp-target-min");
    for (const key of ["left", "top", "width", "height"])
      doc.documentElement.style.removeProperty(`--clipp-content-${key}`);
  };
}
