export type PairingScanError =
  | "camera_permission_denied"
  | "camera_not_found"
  | "camera_unavailable"
  | "camera_decode_failed";

/** Capture completes before Pairing validation/submission starts. */
export type PairingScanResult =
  | { status: "scanned"; text: string }
  | { status: "cancelled" }
  | { status: "failed"; error: PairingScanError };

export type PairingScanOptions = { signal: AbortSignal };
export type CameraPermissionState = "granted" | "denied" | "unknown";
export type PairingCameraPermission = {
  read(): Promise<CameraPermissionState>;
  subscribeReturn(listener: () => void): () => void;
};

export function pairingScanErrorMessage(error: PairingScanError): string {
  switch (error) {
    case "camera_permission_denied":
      return "Camera permission is required. Allow Camera in Android Settings → Apps → Clipp → Permissions, then choose Scan QR again. You can also paste pairing text.";
    case "camera_not_found":
      return "No camera was found. Connect an available camera and try again, or paste pairing text.";
    case "camera_decode_failed":
      return "The camera frame could not be read. Try scanning again, or paste pairing text.";
    default:
      return "The camera could not be opened. Check that it is available, then try again, or paste pairing text.";
  }
}
