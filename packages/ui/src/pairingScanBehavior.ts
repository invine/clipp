import { useEffect, useRef, useState } from "react";
import type { UiSession } from "./uiSession";
import type {
  CameraPermissionState,
  PairingCameraPermission,
  PairingScanError,
  PairingScanOptions,
  PairingScanResult,
} from "./pairingScan";
import type { PairingSubmissionResult } from "../../core/pairing/results";

type Capture = {
  controller: AbortController;
  unsubscribe: () => void;
};

/** Owns capture lifetime and the transition from a decoded target to Pairing. */
export function usePairingScanBehavior(options: {
  session: UiSession;
  identityId?: string;
  runtimeOwner: object;
  ready: boolean;
  scan?: (options: PairingScanOptions) => Promise<PairingScanResult>;
  submit(text: string): Promise<PairingSubmissionResult>;
  permission?: PairingCameraPermission;
}) {
  const { session, identityId, runtimeOwner, ready, scan, submit, permission } =
    options;
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<PairingScanError | null>(null);
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermissionState>("unknown");
  const active = useRef<Capture | null>(null);
  const identityRef = useRef(identityId);
  const ownerRef = useRef(runtimeOwner);
  identityRef.current = identityId;
  ownerRef.current = runtimeOwner;

  useEffect(() => {
    const current = active.current;
    active.current = null;
    current?.controller.abort();
    current?.unsubscribe();
    setIsScanning(false);
    setError(null);
    return () => {
      const pending = active.current;
      active.current = null;
      pending?.controller.abort();
      pending?.unsubscribe();
    };
  }, [identityId, runtimeOwner]);

  useEffect(() => {
    if (error !== "camera_permission_denied" || !permission) return;
    let live = true;
    let revision = 0;
    const read = () => {
      const request = ++revision;
      void permission
        .read()
        .catch(() => "unknown" as const)
        .then((state) => {
          if (live && revision === request) setCameraPermission(state);
        });
    };
    read();
    const unsubscribe = permission.subscribeReturn(read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [error, permission]);

  async function start() {
    if (
      !ready ||
      !scan ||
      active.current ||
      session.pairing.getSnapshot().pending
    )
      return;
    const tasks = session.getSnapshot().tasks;
    const task = tasks[tasks.length - 1];
    if (task?.kind !== "pairing") return;
    const expectedOwner = runtimeOwner;
    const expectedIdentity = identityId;
    const controller = new AbortController();
    const capture: Capture = { controller, unsubscribe: () => {} };
    const valid = () =>
      active.current === capture &&
      !controller.signal.aborted &&
      ownerRef.current === expectedOwner &&
      identityRef.current === expectedIdentity;
    active.current = capture;
    capture.unsubscribe = session.subscribe(() => {
      const currentTasks = session.getSnapshot().tasks;
      if (currentTasks[currentTasks.length - 1] !== task) {
        controller.abort();
        capture.unsubscribe();
        if (active.current === capture) active.current = null;
        setIsScanning(false);
      }
    });
    setError(null);
    setCameraPermission("unknown");
    setIsScanning(true);
    try {
      const result = await scan({ signal: controller.signal });
      if (!valid()) return;
      if (result.status === "failed") {
        setError(result.error);
        return;
      }
      if (result.status !== "scanned") return;
      const text = result.text.trim();
      if (text) {
        session.pairing.change(text);
        await session.pairing.submit(submit);
      }
    } catch {
      if (valid()) setError("camera_unavailable");
    } finally {
      capture.unsubscribe();
      if (active.current === capture) {
        active.current = null;
        if (
          ownerRef.current === expectedOwner &&
          identityRef.current === expectedIdentity
        )
          setIsScanning(false);
      }
    }
  }

  return {
    isScanning,
    error,
    cameraPermission,
    start,
    clearError: () => setError(null),
  };
}
