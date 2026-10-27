import { createResetOverlapContinue } from "./resetOverlapContinue";
import { overlapFailureReason } from "./resetOverlapTiming";
import { resetOverlapHistoryAccepted } from "./resetOverlapHistory";
import { overlapPorts } from "./resetOverlapAcceptancePorts";
import {
  runResetOverlap,
  type OverlapFailureWitness,
} from "./resetOverlapJourney";
import React from "react";
import { createRoot } from "react-dom/client";
import { v4 as uuidv4 } from "uuid";
import { AndroidApp, type AndroidAppRuntime } from "./AndroidApp";
import { createAndroidRuntime } from "./client";
import {
  parseResetOwningManifest,
  type ResetOwningManifest,
} from "./resetOwningManifest";

/** This module is selected only by the explicit normal-Activity acceptance build. */
function mount(manifest: ResetOwningManifest, output: HTMLOutputElement) {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("entry_root_unavailable");
  const owner = createAndroidRuntime();
  const root = createRoot(rootElement);
  const documentId = uuidv4();
  const expiresAt = Date.now() + manifest.deadlineMs;
  let overlapFailure: OverlapFailureWitness | undefined;
  let overlapStartOutcome:
    "completed" | "rejected-reset-fence-code" | "not-observed" = "not-observed";
  let disposed = false;
  let ready = false;
  let refreshPending = false;
  let refreshRunning = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const publicFields = new Set([
    "operationId",
    "currentPeerId",
    "formerPeerId",
    "generatedPeerId",
    "clipCount",
    "pinnedCount",
    "markerMatchCount",
    "overlapElapsedMs",
    "overlapRemainingMs",
    "autoSync",
    "theme",
    "backgroundEnabled",
    "backgroundStateKnown",
    "localRetentionMs",
    "sharingLifetimeMs",
    "historyAvailable",
    "receiptPresent",
    "error",
    "overlapStartOutcome",
    "failurePhase",
    "failureStartGate",
    "failureFenceGate",
    "failureKind",
  ]);
  const emit = (
    stage: string,
    fields: Record<string, string | number | boolean> = {}
  ) => {
    const selected = Object.fromEntries(
      Object.entries(fields).filter(
        ([key, value]) =>
          publicFields.has(key) &&
          (typeof value !== "string" || value.length <= 512) &&
          (typeof value !== "number" || Number.isSafeInteger(value))
      )
    );
    const encoded = JSON.stringify({
      version: 1,
      caseId: manifest.caseId,
      documentId,
      stage,
      ...selected,
    });
    output.textContent =
      encoded.length <= 4096
        ? encoded
        : JSON.stringify({ version: 1, stage: "progress-unconfirmed" });
  };
  let observeStart!: (promise: Promise<void>) => void;
  const shellReady = new Promise<void>((resolve, reject) => {
    observeStart = (promise) => {
      void promise.then(resolve, reject);
    };
  });
  const runtime: AndroidAppRuntime = {
    client: owner.client,
    start: () => {
      try {
        const promise = owner.start();
        observeStart(promise);
        return promise;
      } catch (error) {
        observeStart(Promise.reject(error));
        throw error;
      }
    },
    stop: owner.stop,
  };
  const refresh = () => {
    if (!ready || disposed || manifest.mode !== "observe-preflight") return;
    refreshPending = true;
    if (refreshRunning) return;
    refreshRunning = true;
    void (async () => {
      while (refreshPending && !disposed) {
        refreshPending = false;
        const [state, settings] = await Promise.all([
          owner.publicState(),
          owner.client.getSettings(),
        ]);
        if (disposed) return;
        emit(
          state.identity &&
            !state.identityRotationRecovery &&
            !state.historyUnavailable &&
            !state.historyRefreshError &&
            state.backgroundContinuity?.controlStateKnown === true
            ? "preflight-ready"
            : "preflight-unavailable",
          {
            currentPeerId: state.identity?.deviceId ?? "",
            clipCount: state.clips.length,
            pinnedCount: state.pinnedIds.length,
            autoSync: settings.snapshot.state.autoSync,
            theme: settings.snapshot.state.theme,
            localRetentionMs: settings.snapshot.state.localRetentionMs,
            sharingLifetimeMs: settings.snapshot.state.sharingLifetimeMs,
            backgroundStateKnown:
              state.backgroundContinuity?.controlStateKnown === true,
            ...(state.backgroundContinuity?.controlStateKnown === true
              ? {
                  backgroundEnabled:
                    state.backgroundContinuity.backgroundEnabled,
                }
              : {}),
            historyAvailable:
              !state.historyUnavailable && !state.historyRefreshError,
          }
        );
      }
    })()
      .catch(() => {
        if (!disposed) emit("observation-unconfirmed");
      })
      .finally(() => {
        refreshRunning = false;
      });
  };
  const unsubscribeState = owner.client.onUpdate(refresh);
  const unsubscribeSettings = owner.client.onSettingsUpdate(refresh);
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(deadline);
    unsubscribeState();
    unsubscribeSettings();
    emit("stopping");
    root.unmount();
    void owner.stop().then(
      () => emit("stopped"),
      () => emit("stop-unconfirmed")
    );
    window.removeEventListener("pagehide", teardown);
  };
  window.addEventListener("pagehide", teardown);
  emit("shell-start-pending");
  root.render(<AndroidApp runtime={runtime} />);
  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(
      () => reject(new Error("startup_deadline")),
      manifest.deadlineMs
    );
  });
  let expired = false;
  let releaseWait: (() => void) | undefined;
  const finish = (
    stage: string,
    fields: Record<string, string | number | boolean> = {}
  ) => {
    clearTimeout(deadline);
    if (!disposed && !expired) emit(stage, fields);
  };
  const wait = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        releaseWait = undefined;
        resolve();
      }, 100);
      releaseWait = () => {
        clearTimeout(timer);
        releaseWait = undefined;
        resolve();
      };
    });
  window.addEventListener("pagehide", () => releaseWait?.(), { once: true });
  async function execute(allowBegin = true) {
    if (manifest.mode !== "execute") return;
    const active = () => !disposed && !expired;
    const selected = async () => {
      const [state, settings] = await Promise.all([
        owner.publicState(),
        owner.client.getSettings(),
      ]);
      return { state, settings: settings.snapshot.state };
    };
    const settingsMatch = (
      value: Awaited<ReturnType<typeof selected>>,
      backgroundEnabled = manifest.expected.backgroundEnabled
    ) => {
      const e = manifest.expected;
      return (
        value.settings.theme === e.theme &&
        value.settings.autoSync === e.autoSync &&
        value.settings.localRetentionMs === e.localRetentionMs &&
        value.settings.sharingLifetimeMs === e.sharingLifetimeMs &&
        value.state.backgroundContinuity?.controlStateKnown === true &&
        value.state.backgroundContinuity.backgroundEnabled === backgroundEnabled
      );
    };
    let reconciled = await owner.identityReset.reconcile();
    if (!active()) return;
    while (reconciled.phase === "checking") {
      if (
        reconciled.operationId &&
        reconciled.operationId !== manifest.operationId
      ) {
        finish("operation-mismatch");
        return;
      }
      // A checking outcome never authorizes another begin in this document.
      allowBegin = false;
      emit("checking", { operationId: manifest.operationId });
      await wait();
      if (!active()) return;
      reconciled = await owner.identityReset.reconcile();
      if (!active()) return;
    }
    if (reconciled.phase === "idle" || reconciled.phase === "completed") {
      const guard = reconciled.completedOperation;
      const receipt = reconciled.receipt;
      if (guard || receipt) {
        if (
          !guard ||
          guard.operationId !== manifest.operationId ||
          (receipt &&
            (receipt.operationId !== manifest.operationId ||
              receipt.formerPeerId !== manifest.reviewedPeerId ||
              receipt.generatedPeerId !== guard.generatedPeerId))
        ) {
          finish("operation-mismatch");
          return;
        }
        const current = await selected();
        if (!active()) return;
        if (current.state.identity?.deviceId !== guard.generatedPeerId) {
          finish("restart-required", {
            operationId: manifest.operationId,
            generatedPeerId: guard.generatedPeerId,
          });
          return;
        }
        if (
          !settingsMatch(current, true) ||
          current.state.identityRotationRecovery ||
          current.state.historyUnavailable ||
          current.state.historyRefreshError ||
          !resetOverlapHistoryAccepted(
            current.state.clips,
            manifest.caseId,
            guard.generatedPeerId
          ) ||
          current.state.pinnedIds.length
        ) {
          finish("replacement-unconfirmed", {
            operationId: manifest.operationId,
          });
          return;
        }
        finish("replacement-ready", {
          operationId: manifest.operationId,
          currentPeerId: guard.generatedPeerId,
          formerPeerId: manifest.reviewedPeerId,
          receiptPresent: !!receipt,
          clipCount: current.state.clips.length,
          pinnedCount: 0,
          theme: current.settings.theme,
          autoSync: current.settings.autoSync,
          backgroundEnabled:
            current.state.backgroundContinuity?.backgroundEnabled === true,
          localRetentionMs: current.settings.localRetentionMs,
          sharingLifetimeMs: current.settings.sharingLifetimeMs,
        });
        return;
      }
    }
    let result: Awaited<ReturnType<typeof owner.identityReset.begin>>;
    if (reconciled.phase !== "idle") {
      if (reconciled.operationId !== manifest.operationId) {
        finish("operation-mismatch");
        return;
      }
      emit("resume-submitted", { operationId: manifest.operationId });
      result = await owner.identityReset.resume({
        operationId: manifest.operationId,
      });
    } else {
      if (!allowBegin) {
        finish("not-accepted", { operationId: manifest.operationId });
        return;
      }
      while (active()) {
        const current = await selected();
        if (!active()) return;
        if (current.state.identity?.deviceId !== manifest.reviewedPeerId) {
          finish("reviewed-identity-mismatch");
          return;
        }
        const markerCount = manifest.expected.markers.filter((marker) =>
          current.state.clips.some(
            (clip) =>
              clip.content === marker &&
              clip.originPeerId === manifest.reviewedPeerId
          )
        ).length;
        if (
          settingsMatch(current) &&
          !current.state.historyUnavailable &&
          !current.state.historyRefreshError &&
          markerCount === manifest.expected.markers.length &&
          current.state.pinnedIds.length === manifest.expected.pinnedCount
        )
          break;
        emit("preconditions-pending", {
          operationId: manifest.operationId,
          markerMatchCount: markerCount,
        });
        await wait();
      }
      if (!active()) return;
      emit("begin-submitted", { operationId: manifest.operationId });
      const button = createResetOverlapContinue();
      try {
        result = await runResetOverlap({
          ports: overlapPorts,
          startOutcome: (outcome) => {
            overlapStartOutcome = outcome;
            emit("start-settled", {
              operationId: manifest.operationId,
              overlapStartOutcome,
            });
          },
          failure: (witness) => {
            overlapFailure = witness;
          },
          start: () => owner.client.setBackgroundContinuity(true),
          begin: () =>
            owner.identityReset.begin({
              operationId: manifest.operationId,
              reviewedPeerId: manifest.reviewedPeerId,
            }),
          stage: (stage, timing) =>
            emit(stage, { operationId: manifest.operationId, ...timing }),
          ingress: () =>
            new Promise<void>((resolve) => {
              button.addEventListener("click", () => resolve(), { once: true });
              document.body.appendChild(button);
            }),
        });
      } finally {
        button.remove();
      }
    }
    if (!active()) return;
    if (result.outcome === "rejected") {
      finish("reset-rejected", {
        overlapStartOutcome,
        operationId: manifest.operationId,
        error: result.code,
      });
      return;
    }
    if (result.outcome === "completed")
      finish("restart-required", {
        operationId: manifest.operationId,
        overlapStartOutcome,
      });
    else if (result.outcome === "outcome-unconfirmed") {
      emit("checking", { operationId: manifest.operationId });
      await wait();
      if (active()) await execute(false);
    } else finish("incomplete", { operationId: manifest.operationId });
  }
  void Promise.race([shellReady, timeout]).then(
    () => {
      clearTimeout(deadline);
      if (disposed) return;
      ready = true;
      if (manifest.mode === "execute") {
        deadline = setTimeout(
          () => {
            if (!disposed) {
              emit("operation-unconfirmed", {
                operationId: manifest.operationId,
              });
              expired = true;
              releaseWait?.();
            }
          },
          Math.max(0, expiresAt - Date.now())
        );
        void execute().catch((error: unknown) =>
          finish("operation-unconfirmed", {
            operationId: manifest.operationId,
            error: overlapFailureReason(error),
            overlapStartOutcome,
            ...(overlapFailure
              ? {
                  failurePhase: overlapFailure.phase,
                  failureStartGate: overlapFailure.startGate,
                  failureFenceGate: overlapFailure.fenceGate,
                  failureKind: overlapFailure.errorKind,
                }
              : {}),
          })
        );
      } else refresh();
    },
    () => {
      if (!disposed) emit("startup-unconfirmed");
    }
  );
}

const progress = document.getElementById("clipp-reset-owning-progress");
if (progress instanceof HTMLOutputElement) {
  progress.hidden = true;
  let manifest: ResetOwningManifest | undefined;
  try {
    manifest = parseResetOwningManifest(
      document.getElementById("clipp-reset-owning-manifest")?.textContent ?? ""
    );
  } catch {
    progress.textContent = JSON.stringify({
      version: 1,
      stage: "invalid-manifest",
    });
  }
  if (manifest) {
    try {
      mount(manifest, progress);
    } catch {
      progress.textContent = JSON.stringify({
        version: 1,
        stage: "entry-unavailable",
      });
    }
  }
}
