import { createHash } from "node:crypto";
import {
  isSyntheticClipFact,
  parseElectronResetOwningManifest,
} from "./resetOwningManifest.js";

type Progress = Readonly<Record<string, string | number | boolean>>;

/**
 * Explicit acceptance export, never loaded by normal main. The root launcher
 * admits this process/profile BEFORE calling it, including fresh admission of a
 * real app.relaunch successor. This entry grants no renderer action authority.
 */
export async function startElectronResetOwningAcceptance(
  text: string,
  emit: (progress: Progress) => void
) {
  // Invalid input cannot even import the production runtime or create SQLite.
  const manifest = parseElectronResetOwningManifest(text);
  type Owner = Awaited<
    ReturnType<typeof import("./electronRuntime.js").startElectronRuntime>
  >;
  let owner: Owner | undefined;
  let stopped: Promise<void> | undefined;
  let expired = false;
  let observing = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline!: (reason: Error) => void;
  const timedOut = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  // Later observation also owns this rejection after initial startup finishes.
  void timedOut.catch(() => undefined);
  let lastProgress = "";
  let records = 0;
  let bytes = 0;
  const publish = (stage: string, fields: Progress = {}) => {
    try {
      const row = { version: 1, caseId: manifest.caseId, stage, ...fields };
      const text = JSON.stringify(row);
      if (text === lastProgress) return true;
      const size = Buffer.byteLength(text, "utf8");
      if (size > 4096 || ++records > 1024 || (bytes += size) > 1048576)
        return false;
      emit(row);
      lastProgress = text;
      return true;
    } catch {
      return false;
    }
  };
  const configurationSha256 = (
    state: Awaited<ReturnType<Owner["publicState"]>>
  ) =>
    createHash("sha256")
      .update(JSON.stringify(state.managedRelayConfigurations))
      .digest("hex");
  const stop = () =>
    (stopped ??= (async () => {
      clearInterval(interval);
      clearTimeout(deadline);
      try {
        await owner?.stop();
      } finally {
        publish("stopped");
      }
    })());
  const current = () =>
    !stopped && !expired && Date.now() < manifest.deadlineUnixMs;
  const insistCurrent = () => {
    if (!current()) throw new Error("entry_deadline_or_stop");
  };
  deadline = setTimeout(() => {
    expired = true;
    publish("deadline-expired");
    rejectDeadline(new Error("entry_deadline"));
    void stop().catch(() => publish("stop-unconfirmed"));
  }, manifest.deadlineUnixMs - Date.now());
  try {
    const entry = await Promise.race([
      import("./electronRuntime.js"),
      timedOut,
    ]);
    insistCurrent();
    const creating = entry.startElectronRuntime().then(async (value) => {
      owner = value;
      // An uncancellable startup that settles late must still retire its owner.
      if (!current()) await value.stop();
      return value;
    });
    await Promise.race([creating, timedOut]);
    if (!owner) throw new Error("owner_unavailable");
    await Promise.race([owner.ready, timedOut]);
    insistCurrent();
    const snapshot = async () => {
      const state = await owner!.publicState();
      insistCurrent();
      if (
        !state.identity ||
        state.identityRotationRecovery ||
        state.historyUnavailable ||
        state.historyRefreshError
      )
        throw new Error("public_state_unavailable");
      return state;
    };
    const initial = await Promise.race([snapshot(), timedOut]);
    if (
      manifest.mode === "observe-replay" &&
      (initial.clips.length !== 0 || initial.pinnedIds.length !== 0)
    )
      throw new Error("replay_history_not_empty");
    const markers =
      manifest.mode === "observe-preflight"
        ? manifest.markers
        : manifest.expected.markers;
    let projectionId = 0;
    let previousProjection = "";
    const project = (state: Awaited<ReturnType<Owner["publicState"]>>) => {
      if (
        !Number.isSafeInteger(state.sharingLifetimeMs) ||
        state.sharingLifetimeMs < 1 ||
        state.sharingLifetimeMs > 2592000000
      )
        throw new Error("synthetic_projection_unavailable");
      const facts = markers.map((marker) => {
        const matching = state.clips.filter((clip) => clip.content === marker);
        if (matching.length > 1)
          throw new Error("synthetic_projection_ambiguous");
        if (!matching.length) return null;
        const clip = matching[0];
        const fact = {
          id: clip.id,
          originPeerId: clip.originPeerId,
          capturedAt: clip.capturedAt,
          shareExpiresAt: clip.shareExpiresAt,
          pinned: state.pinnedIds.some((id) => id === clip.id),
        };
        if (
          !isSyntheticClipFact(fact) ||
          fact.originPeerId !== state.identity!.deviceId
        )
          throw new Error("synthetic_projection_unavailable");
        return fact;
      });
      const ids = facts.flatMap((fact) => (fact ? [fact.id] : []));
      if (new Set(ids).size !== ids.length)
        throw new Error("synthetic_projection_ambiguous");
      return facts;
    };
    const publishProjection = (
      state: Awaited<ReturnType<Owner["publicState"]>>,
      facts: ReturnType<typeof project>
    ) => {
      const fingerprint = JSON.stringify([
        state.localRetentionMs,
        state.sharingLifetimeMs,
        facts,
      ]);
      if (fingerprint !== previousProjection) {
        const next = projectionId + 1;
        for (let index = 0; index < facts.length; index++) {
          const fact = facts[index];
          if (
            fact &&
            !publish("synthetic-clip", {
              projectionId: next,
              markerIndex: index,
              clipId: fact.id,
              originPeerId: fact.originPeerId,
              capturedAt: fact.capturedAt,
              shareExpiresAt: fact.shareExpiresAt,
              pinned: fact.pinned,
            })
          )
            throw new Error("observation_unavailable");
        }
        projectionId = next;
        previousProjection = fingerprint;
      }
      return {
        syntheticProjectionId: projectionId,
        syntheticClipCount: facts.filter((fact) => fact !== null).length,
        sharingLifetimeMs: state.sharingLifetimeMs,
      };
    };
    const observation = async () => {
      if (!current() || observing) return;
      observing = true;
      try {
        const state = await snapshot();
        const expected =
          manifest.mode !== "observe-preflight" ? manifest.expected : undefined;
        const reset = state.identityResetState;
        const receipt =
          reset.phase === "idle" || reset.phase === "completed"
            ? reset.receipt
            : undefined;
        const generatedPeerId = state.identity!.deviceId;
        if (
          manifest.mode === "observe-replay" &&
          (reset.phase !== "idle" ||
            receipt?.operationId !== manifest.operationId ||
            receipt.formerPeerId !== manifest.reviewedPeerId ||
            receipt.generatedPeerId !== generatedPeerId ||
            generatedPeerId === manifest.reviewedPeerId ||
            state.autoSync !== manifest.expected.autoSync ||
            state.sharingLifetimeMs !== manifest.expected.sharingLifetimeMs ||
            state.localRetentionMs !== manifest.expected.localRetentionMs ||
            configurationSha256(state) !==
              manifest.expected.configurationSha256 ||
            state.identity!.deviceName !== "Desktop" ||
            state.identity!.nameRevision !== 0 ||
            state.identity!.membershipView?.admittedPeerIds.length !== 1 ||
            state.identity!.membershipView.admittedPeerIds[0] !==
              generatedPeerId ||
            state.identity!.membershipView.revokedPeerIds.length !== 0 ||
            state.devices.length !== 0 ||
            state.pinnedIds.length !== 0 ||
            state.clips.length > 1 ||
            state.clips.some(
              (clip) =>
                clip.content !== manifest.expected.nextMarker ||
                clip.originPeerId !== generatedPeerId
            ))
        )
          throw new Error("replay_mismatch");
        if (
          !publish(
            manifest.mode === "observe-replay"
              ? "replay-observation"
              : "preflight-observation",
            {
              ...(manifest.mode === "observe-preflight"
                ? publishProjection(state, project(state))
                : {}),
              currentPeerId: generatedPeerId,
              clipCount: state.clips.length,
              pinnedCount: state.pinnedIds.length,
              autoSync: state.autoSync,
              localRetentionMs: state.localRetentionMs,
              sharingLifetimeMs: state.sharingLifetimeMs,
              configurationCount: state.managedRelayConfigurations.length,
              configurationSha256: configurationSha256(state),
              deviceName: state.identity!.deviceName,
              nameRevision: state.identity!.nameRevision ?? 0,
              singleton:
                state.identity!.membershipView?.admittedPeerIds.length === 1 &&
                state.identity!.membershipView.admittedPeerIds[0] ===
                  generatedPeerId &&
                state.identity!.membershipView.revokedPeerIds.length === 0,
              receiptPresent: !!receipt,
              ...(receipt
                ? {
                    operationId: receipt.operationId,
                    formerPeerId: receipt.formerPeerId,
                    generatedPeerId: receipt.generatedPeerId,
                  }
                : {}),
              ...(expected
                ? {
                    formerMarkerMatches: state.clips.filter((clip) =>
                      expected.markers.includes(clip.content)
                    ).length,
                    nextMarkerMatches: state.clips.filter(
                      (clip) => clip.content === expected.nextMarker
                    ).length,
                    nextMarkerOriginMatches: state.clips.filter(
                      (clip) =>
                        clip.content === expected.nextMarker &&
                        clip.originPeerId === generatedPeerId
                    ).length,
                  }
                : {}),
            }
          )
        )
          throw new Error("observation_unavailable");
      } catch {
        publish("observation-unconfirmed");
        void stop().catch(() => publish("stop-unconfirmed"));
        throw new Error("observation_unconfirmed");
      } finally {
        observing = false;
      }
    };
    if (manifest.mode === "execute") {
      if (
        initial.identity!.deviceId !== manifest.reviewedPeerId ||
        initial.identityResetState.phase !== "idle" ||
        initial.identityResetState.receipt ||
        initial.identity!.deviceName !== manifest.expected.deviceName ||
        (initial.identity!.nameRevision ?? 0) !==
          manifest.expected.nameRevision ||
        initial.autoSync !== manifest.expected.autoSync ||
        initial.localRetentionMs !== manifest.expected.localRetentionMs ||
        configurationSha256(initial) !==
          manifest.expected.configurationSha256 ||
        initial.pinnedIds.length !== manifest.expected.pinnedCount ||
        initial.clips.length !== manifest.expected.markers.length ||
        !manifest.expected.markers.every(
          (marker) =>
            initial.clips.filter((clip) => clip.content === marker).length === 1
        )
      )
        throw new Error("preflight_mismatch");
      const facts = project(initial);
      if (
        initial.sharingLifetimeMs !== manifest.expected.sharingLifetimeMs ||
        JSON.stringify(facts) !==
          JSON.stringify(manifest.expected.syntheticClips)
      )
        throw new Error("preflight_mismatch");
      insistCurrent();
      if (
        !publish("pre-reset-matched", {
          ...publishProjection(initial, facts),
          currentPeerId: initial.identity!.deviceId,
          deviceName: initial.identity!.deviceName,
          nameRevision: initial.identity!.nameRevision ?? 0,
          localRetentionMs: initial.localRetentionMs,
        })
      )
        throw new Error("observation_unavailable");
      insistCurrent();
      if (
        !publish("begin-requested", {
          operationId: manifest.operationId,
          formerPeerId: manifest.reviewedPeerId,
        })
      )
        throw new Error("observation_unavailable");
      const result = await Promise.race([
        owner.identityReset.begin({
          operationId: manifest.operationId,
          reviewedPeerId: manifest.reviewedPeerId,
        }),
        timedOut,
      ]);
      // Real success normally exits before this continuation. A completed result
      // in the former process means restart remains required, never native PASS.
      insistCurrent();
      publish("begin-returned", {
        outcome: result.outcome,
        restartRequired: true,
      });
      await stop();
    } else {
      await Promise.race([observation(), timedOut]);
      interval = setInterval(() => {
        void observation().catch(() => undefined);
      }, 250);
    }
    return { stop };
  } catch (error) {
    publish("entry-unconfirmed");
    await stop();
    throw error;
  }
}
