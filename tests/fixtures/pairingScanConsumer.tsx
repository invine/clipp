import React from "react";
import { createRoot } from "react-dom/client";
import { ClipboardApp } from "../../packages/ui/src/ClipboardApp";
import { createUiSession } from "../../packages/ui/src/uiSession";
import { createHostTaskInput } from "../../packages/ui/src/hostTaskInput";
import { createAndroidPairingScanner } from "../../apps/android/src/pairingScannerHost";
import { createPairingCode } from "../../packages/core/pairing/qrCode";
import {
  encodePairingTarget,
  decodePairingTarget,
} from "../../packages/core/pairing/v2";
import { Buffer } from "buffer";
import type { CameraPermissionState } from "../../packages/ui/src/pairingScan";
declare const PUBLIC_SIGNED_TARGET: {
  targetPeerId: string;
  signedPeerRecord: string;
};
const signedTarget = PUBLIC_SIGNED_TARGET;

declare global {
  interface Window {
    scannerConsumer: Awaited<ReturnType<typeof mount>>;
  }
}
async function mount() {
  Object.assign(globalThis, { Buffer });
  const text = encodePairingTarget({
    targetPeerId: signedTarget.targetPeerId,
    signedPeerRecord: new Uint8Array(
      Buffer.from(signedTarget.signedPeerRecord, "base64")
    ),
  });
  const code = await createPairingCode(text);
  const image = new Image();
  image.src = code.image!;
  await image.decode();
  // Only controlled media surfaces use the supplied generated public pixels.
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    set() {},
  });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 2,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => image.width,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => image.height,
  });
  HTMLMediaElement.prototype.play = async () => {};
  HTMLMediaElement.prototype.pause = () => {};
  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (
    this: CanvasRenderingContext2D,
    source: CanvasImageSource,
    ...args: number[]
  ) {
    Reflect.apply(drawImage, this, [
      source instanceof HTMLVideoElement ? image : source,
      ...args,
    ]);
  } as typeof drawImage;
  const session = createUiSession();
  session.update({ search: "retained query" });
  session.pairing.change("retained draft");
  session.open({ kind: "pairing", origin: "fixture-pairing" });
  const input = createHostTaskInput(session);
  input.setReady(true);
  const returnListeners = new Set<(event: Record<string, unknown>) => void>();
  let cameraPermission: CameraPermissionState = "denied";
  let permissionReads = 0;
  const scanner = createAndroidPairingScanner(input, {
    on: async (_name, callback) => {
      returnListeners.add(callback);
      return () => {
        returnListeners.delete(callback);
      };
    },
    cameraPermission: async () => {
      permissionReads++;
      return cameraPermission;
    },
  });
  const attempts: string[] = [];
  let finishSubmission!: () => void;
  let mode = "deny",
    requests = 0,
    stops = 0;
  let acquire: (() => void) | undefined;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia() {
        requests++;
        if (mode === "deny")
          return Promise.reject(
            new DOMException("fixture permission denial", "NotAllowedError")
          );
        if (mode === "decode")
          return Promise.resolve({
            getTracks: () => [
              {
                stop() {
                  stops++;
                },
              },
            ],
          });
        return new Promise((resolve) => {
          acquire = () =>
            resolve({
              getTracks: () => [
                {
                  stop() {
                    stops++;
                  },
                },
              ],
            });
        });
      },
    },
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText() {
        throw Error("host_clipboard_forbidden");
      },
      writeText() {
        throw Error("host_clipboard_forbidden");
      },
    },
  });
  Object.defineProperty(window, "BarcodeDetector", {
    configurable: true,
    get() {
      throw Error("unsafe_provider_forbidden");
    },
  });
  window.alert = () => {
    throw Error("blocking_alert_forbidden");
  };
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <ClipboardApp
      session={session}
      taskInput={input}
      clips={[]}
      devices={[]}
      pending={[]}
      peers={[]}
      pinnedIds={[]}
      identity={{
        deviceId: "fixture",
        deviceName: "Scanner fixture",
      }}
      onDeleteClip={() => {}}
      onUnpair={() => {}}
      onAccept={async () => ({ ok: true, admitted: true })}
      onReject={async () => ({ ok: true, admitted: false })}
      onPairText={async (text) => {
        if (
          decodePairingTarget(text)?.targetPeerId !== signedTarget.targetPeerId
        )
          throw Error("invalid_public_scanned_target");
        attempts.push(text);
        return new Promise((resolve) => {
          finishSubmission = () =>
            resolve({ ok: false, error: "outcome_unconfirmed" });
        });
      }}
      onRequestPairingCode={async () => null}
      onCopyPairingText={async () => ({ status: "copied" })}
      onReuseClip={() => "complete"}
      onShareNow={() => {}}
      onSetPinned={() => {}}
      onClearAll={() => {}}
      onScanPairingCode={(options) => scanner.scan(options)}
      scanCameraPermission={scanner.permission}
    />
  );
  return {
    attempts,
    pending() {
      mode = "pending";
    },
    permissionReturn(state: CameraPermissionState = "granted") {
      cameraPermission = state;
      for (const callback of returnListeners)
        callback({ resumed: true, windowFocused: true });
    },
    permissionReads: () => permissionReads,
    decode() {
      mode = "decode";
    },
    pairing: () => session.pairing.getSnapshot(),
    finishSubmission() {
      finishSubmission();
    },
    acquire() {
      acquire?.();
    },
    stats: () => ({
      requests,
      stops,
      query: session.getSnapshot().search,
      draft: session.pairing.getSnapshot().raw,
    }),
    closeTask() {
      session.close();
    },
    reopen() {
      session.open({ kind: "pairing", origin: "fixture-pairing" });
    },
    dispose() {
      root.unmount();
      scanner.dispose();
    },
  };
}
void mount().then((value) => {
  window.scannerConsumer = value;
});
