import jsQR from "jsqr";

const SCANNER_ID = "clipp-android-qr-scanner";
const AUTO_SCAN_INTERVAL_MS = 220;

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function appendStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) {
  Object.assign(element.style, styles);
}

function cameraErrorMessage(err: unknown): Error {
  if (err instanceof DOMException) {
    if (
      err.name === "NotAllowedError" ||
      err.name === "PermissionDeniedError"
    ) {
      return new Error("camera_permission_denied");
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return new Error("camera_not_found");
    }
  }
  return err instanceof Error ? err : new Error("camera_unavailable");
}

type QrBarcodeDetector = {
  detect(source: HTMLCanvasElement): Promise<Array<{ rawValue: string }>>;
};

function createBarcodeDetector(): QrBarcodeDetector | null {
  const detector = (globalThis as any).BarcodeDetector;
  if (!detector) return null;
  try {
    return new detector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/** Geometry-only scanner surface. Construction never touches a decoder, camera or permission. */
export function createPairingScannerOverlay() {
  const overlay = document.createElement("div");
  overlay.id = SCANNER_ID;
  appendStyles(overlay, {
    position: "fixed",
    left: "var(--clipp-content-left, 0px)",
    top: "var(--clipp-content-top, 0px)",
    width: "var(--clipp-content-width, 100%)",
    height: "var(--clipp-content-height, 100%)",
    zIndex: "9999",
    display: "flex",
    flexDirection: "column",
    background: "var(--clipp-surface)",
    color: "var(--clipp-text)",
  });

  const videoWrap = document.createElement("div");
  appendStyles(videoWrap, {
    position: "relative",
    flex: "1",
    minHeight: "0",
    overflow: "hidden",
    background: "#000000",
  });

  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  appendStyles(video, {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  });

  const frame = document.createElement("div");
  appendStyles(frame, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "min(72%, 320px)",
    aspectRatio: "1 / 1",
    transform: "translate(-50%, -50%)",
    border: "2px solid rgba(255,255,255,0.9)",
    borderRadius: "18px",
    boxShadow: "0 0 0 999px rgba(0,0,0,0.34)",
    pointerEvents: "none",
  });

  const toolbar = document.createElement("div");
  // Scanner actions are a shared task surface outside ClipboardApp. Reuse its
  // semantic controls/focus/target token; the overlay still owns native bounds.
  toolbar.className = "task-dialog";
  appendStyles(toolbar, {
    width: "100%",
    boxSizing: "border-box",
    border: "0",
    borderRadius: "0",
    boxShadow: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "12px",
    padding: "14px 16px",
    flexShrink: "0",
    maxHeight: "100%",
    overflowY: "auto",
    background: "var(--clipp-surface)",
    borderTop: "1px solid var(--clipp-border)",
  });

  const status = document.createElement("div");
  status.textContent = "Opening camera";
  appendStyles(status, {
    fontSize: "0.875rem",
    fontWeight: "500",
    color: "var(--clipp-text)",
  });

  const actionRow = document.createElement("div");
  appendStyles(actionRow, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "10px",
  });

  const scanNow = document.createElement("button");
  scanNow.type = "button";
  scanNow.className = "primary-button labelled-control";
  scanNow.textContent = "Scan now";
  scanNow.disabled = true;
  appendStyles(scanNow, {
    flex: "1",
    padding: "11px 16px",
    font: "inherit",
    fontWeight: "600",
  });

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "text-button labelled-control";
  cancel.textContent = "Cancel";
  appendStyles(cancel, {
    padding: "11px 16px",
    background: "var(--clipp-surface-raised)",
    font: "inherit",
  });

  actionRow.append(scanNow, cancel);
  toolbar.append(status, actionRow);
  videoWrap.append(video, frame);
  overlay.append(videoWrap, toolbar);
  document.body.append(overlay);

  const fitFrame = () => {
    const rect = videoWrap.getBoundingClientRect();
    frame.style.width = `${Math.max(0, Math.min(rect.width, rect.height) * 0.72)}px`;
  };
  const observer = new ResizeObserver(fitFrame);
  observer.observe(videoWrap);
  fitFrame();
  return {
    overlay,
    video,
    status,
    scanNow,
    cancel,
    dispose() {
      observer.disconnect();
      overlay.remove();
    },
  };
}

export async function scanPairingQrWithCamera(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("camera_unavailable");
  }

  document.getElementById(SCANNER_ID)?.remove();

  let stream: MediaStream | null = null;
  let frameId = 0;
  let settled = false;

  return new Promise<string | null>((resolve, reject) => {
    const { video, status, scanNow, cancel, dispose } =
      createPairingScannerOverlay();

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const barcodeDetector = createBarcodeDetector();
    let lastAutoScanAt = 0;
    let decodeTask: Promise<string | null> | null = null;

    function setScanNowEnabled(enabled: boolean) {
      scanNow.disabled = !enabled;
      scanNow.style.opacity = enabled ? "1" : "0.55";
    }

    function cleanup() {
      if (frameId) cancelAnimationFrame(frameId);
      stopStream(stream);
      dispose();
    }

    function finish(value: string | null) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function fail(err: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(cameraErrorMessage(err));
    }

    function drawVideoFrame(maxWidth: number): boolean {
      if (!context) {
        fail(new Error("canvas_unavailable"));
        return false;
      }

      if (
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return false;
      }

      const scale = Math.min(1, maxWidth / video.videoWidth);
      const width = Math.max(1, Math.floor(video.videoWidth * scale));
      const height = Math.max(1, Math.floor(video.videoHeight * scale));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.drawImage(video, 0, 0, width, height);
      return true;
    }

    function readQrFromImageData(imageData: ImageData): string | null {
      const attempts = ["attemptBoth", "invertFirst", "dontInvert"] as const;
      for (const inversionAttempts of attempts) {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts,
        });
        if (code?.data) return code.data;
      }
      return null;
    }

    function readQrWithJsQr(): string | null {
      if (!context || !canvas.width || !canvas.height) return null;

      const fullFrame = context.getImageData(0, 0, canvas.width, canvas.height);
      const fullResult = readQrFromImageData(fullFrame);
      if (fullResult) return fullResult;

      const cropSize = Math.floor(Math.min(canvas.width, canvas.height) * 0.78);
      const cropX = Math.floor((canvas.width - cropSize) / 2);
      const cropY = Math.floor((canvas.height - cropSize) / 2);
      const centerFrame = context.getImageData(
        cropX,
        cropY,
        cropSize,
        cropSize
      );
      return readQrFromImageData(centerFrame);
    }

    async function readQrWithNativeDetector(): Promise<string | null> {
      if (!barcodeDetector || !canvas.width || !canvas.height) return null;
      try {
        const codes = await barcodeDetector.detect(canvas);
        return codes.find((code) => code.rawValue)?.rawValue || null;
      } catch {
        return null;
      }
    }

    async function decodeCurrentFrame(manual: boolean): Promise<string | null> {
      if (decodeTask) return decodeTask;
      decodeTask = (async () => {
        if (!drawVideoFrame(manual ? 1600 : 1100)) return null;

        const nativeResult = await readQrWithNativeDetector();
        if (nativeResult) return nativeResult;

        return readQrWithJsQr();
      })().finally(() => {
        decodeTask = null;
      });
      return decodeTask;
    }

    function scanFrame(now: number) {
      if (settled) return;

      if (now - lastAutoScanAt >= AUTO_SCAN_INTERVAL_MS) {
        lastAutoScanAt = now;
        void decodeCurrentFrame(false).then((result) => {
          if (result) {
            finish(result);
          }
        });
      }

      frameId = requestAnimationFrame(scanFrame);
    }

    async function scanNowFromCamera() {
      if (scanNow.disabled) return;
      setScanNowEnabled(false);
      status.textContent = "Scanning photo";
      try {
        const result = await decodeCurrentFrame(true);
        if (result) {
          finish(result);
          return;
        }
        status.textContent =
          "No QR found. Hold it inside the square and try again.";
      } finally {
        if (!settled) setScanNowEnabled(true);
      }
    }

    cancel.addEventListener("click", () => finish(null));
    scanNow.addEventListener("click", () => {
      void scanNowFromCamera();
    });

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then(async (nextStream) => {
        if (settled) {
          stopStream(nextStream);
          return;
        }
        stream = nextStream;
        video.srcObject = stream;
        await video.play();
        if (settled) return;
        status.textContent = "Point the camera at the QR code";
        setScanNowEnabled(true);
        frameId = requestAnimationFrame(scanFrame);
      })
      .catch(fail);
  });
}
