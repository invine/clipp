import { parseChromeResetOwningCase } from "./resetOwningCase";

type Owner = typeof import("./background").chromeRuntime;
type PublicRow = Readonly<Record<string, string | number | boolean>>;

/** Explicit acceptance entry only. Reads the existing owner; never creates a replacement. */
export async function startChromeResetOwningAcceptance(
  text: string,
  loadOwner: () => Promise<Owner>
) {
  // Invalid/expired root DATA cannot import the runtime or open storage.
  const rootCase = parseChromeResetOwningCase(text);
  if (rootCase.extensionId !== chrome.runtime.id)
    throw Error("wrong_extension");
  const start = performance.now();
  const lifetime = rootCase.deadlineUnixMs - Date.now();
  const workerIncarnation = crypto.randomUUID();
  let owner: Owner | undefined;
  let stopped: Promise<void> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let failed = false;
  let listener:
    Parameters<typeof chrome.runtime.onMessage.addListener>[0] | undefined;
  let rejectExpiration!: (error: Error) => void;
  const expiration = new Promise<never>((_resolve, reject) => {
    rejectExpiration = reject;
  });
  void expiration.catch(() => undefined);
  const wait = <T>(value: Promise<T>) => Promise.race([value, expiration]);
  let rejectScheduled: ((error: Error) => void) | undefined;
  let bytes = 0;
  const ledger: PublicRow[] = [];
  const current = () =>
    !stopped &&
    Date.now() < rootCase.deadlineUnixMs &&
    performance.now() - start < lifetime;
  const insist = () => {
    if (!current()) throw Error("owning_entry_expired_or_stopped");
  };
  const stop = () =>
    (stopped ??= (async () => {
      rejectExpiration(Error("owning_entry_expired_or_stopped"));
      rejectScheduled?.(Error("owning_entry_expired_or_stopped"));
      clearTimeout(deadline);
      clearTimeout(scheduled);
      if (listener) chrome.runtime.onMessage.removeListener(listener);
      await owner?.stop();
    })());
  deadline = setTimeout(() => {
    void stop().catch(() => undefined);
  }, lifetime);
  try {
    const creating = loadOwner().then(async (value) => {
      owner = value;
      if (!current()) {
        await value.stop();
        throw Error("owning_entry_expired_or_stopped");
      }
      return value;
    });
    void creating.catch(() => undefined);
    await wait(creating);
    if (!owner) throw Error("owner_unavailable");
    await wait(owner.ready);
    insist();
    const hashConfigurations = async (
      state: Awaited<ReturnType<Owner["owningObservation"]>>
    ) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
              JSON.stringify(state.managedRelayConfigurations)
            )
          )
        )
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    const getState = async () => {
      const state = await wait(owner!.owningObservation());
      insist();
      if (
        !state.identity ||
        state.identityRotationRecovery ||
        state.clipboardHistoryError ||
        state.historyPolicyError
      )
        throw Error("public_state_unavailable");
      if (
        state.clips.length > 8 ||
        state.clips.some(
          (clip) =>
            !rootCase.markers.includes(clip.content) &&
            clip.content !== rootCase.nextMarker
        )
      )
        throw Error("unknown_clip_content");
      return state;
    };
    const initial = await getState();
    const reset = initial.identityResetState;
    const receipt =
      reset.phase === "idle" || reset.phase === "completed"
        ? reset.receipt
        : undefined;
    const replay =
      rootCase.mode !== "observe-preflight" &&
      receipt?.operationId === rootCase.operationId;
    if (rootCase.mode === "observe-replay" && !replay)
      throw Error("replay_mismatch");
    const verifyReplay = async (
      state: Awaited<ReturnType<Owner["owningObservation"]>>,
      configurationSha256: string
    ) => {
      if (rootCase.mode === "observe-preflight") throw Error("replay_mismatch");
      const r = state.identityResetState;
      if (
        r.phase !== "idle" ||
        r.receipt?.operationId !== rootCase.operationId ||
        r.receipt.formerPeerId !== rootCase.reviewedPeerId ||
        r.receipt.generatedPeerId !== state.identity?.deviceId ||
        state.identity.deviceId === rootCase.reviewedPeerId ||
        r.completedOperation?.operationId !== rootCase.operationId ||
        r.completedOperation.generatedPeerId !== state.identity.deviceId ||
        state.autoSync !== rootCase.expected.autoSync ||
        state.localRetentionMs !== rootCase.expected.localRetentionMs ||
        configurationSha256 !== rootCase.expected.configurationSha256 ||
        state.identity.deviceName !== "Extension" ||
        state.identity.nameRevision !== 0 ||
        state.identity.membershipView?.admittedPeerIds.length !== 1 ||
        state.identity.membershipView.admittedPeerIds[0] !==
          state.identity.deviceId ||
        state.identity.membershipView.revokedPeerIds.length !== 0 ||
        state.devices.length !== 0 ||
        state.pinnedIds.length !== 0 ||
        state.clips.length > 1 ||
        state.clips.some(
          (clip) =>
            clip.content !== rootCase.nextMarker ||
            clip.originPeerId !== state.identity!.deviceId
        )
      )
        throw Error("replay_mismatch");
    };
    const append = (fields: PublicRow) => {
      const row: PublicRow = Object.freeze({
        version: 1,
        caseId: rootCase.caseId,
        workerIncarnation,
        sequence: ledger.length,
        observedUnixMs: Date.now(),
        deadlineUnixMs: rootCase.deadlineUnixMs,
        mode: rootCase.mode,
        ...fields,
      });
      const size = new TextEncoder().encode(JSON.stringify(row)).length;
      if (size > 4096 || ledger.length >= 256 || bytes + size > 524288)
        throw Error("witness_cap");
      insist();
      ledger.push(row);
      bytes += size;
      return { ...row };
    };
    const observeOnce = async () => {
      insist();
      if (busy || failed) throw Error("observation_unavailable");
      busy = true;
      try {
        const state = await getState();
        const configurationSha256 = await wait(hashConfigurations(state));
        insist();
        if (replay) await verifyReplay(state, configurationSha256);
        const contextRuntime = chrome.runtime as typeof chrome.runtime & {
          getContexts?: (filter: {
            contextTypes: string[];
          }) => Promise<Array<{ contextId: string; documentUrl?: string }>>;
        };
        if (!contextRuntime.getContexts)
          throw Error("context_observation_unavailable");
        const contexts = await wait(
          contextRuntime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })
        );
        insist();
        if (contexts.length > 32)
          throw Error("context_observation_unavailable");
        const offscreenIds = contexts
          .filter(
            (context) =>
              context.documentUrl === chrome.runtime.getURL("offscreen.html")
          )
          .map((context) => context.contextId)
          .sort();
        if (
          offscreenIds.length > 2 ||
          offscreenIds.some(
            (id) => typeof id !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(id)
          )
        )
          throw Error("context_observation_unavailable");
        const clipIdentities: Record<string, string> = {};
        state.clips.forEach((clip, index) => {
          clipIdentities[`clip${index}Id`] = clip.id;
          clipIdentities[`clip${index}OriginPeerId`] = clip.originPeerId;
        });
        return append({
          version: 1,
          caseId: rootCase.caseId,
          workerIncarnation,
          sequence: ledger.length,
          observedUnixMs: Date.now(),
          deadlineUnixMs: rootCase.deadlineUnixMs,
          mode: rootCase.mode,
          stage: replay ? "replay-observation" : "preflight-observation",
          currentPeerId: state.identity!.deviceId,
          offscreenContextCount: offscreenIds.length,
          offscreenContextIds: offscreenIds.join(","),
          configurationSha256,
          configurationCount: state.managedRelayConfigurations.length,
          deviceCount: state.devices.length,
          ...clipIdentities,
          ...(replay
            ? {
                operationId: rootCase.operationId,
                formerPeerId: rootCase.reviewedPeerId,
              }
            : {}),
          clipCount: state.clips.length,
          pinnedCount: state.pinnedIds.length,
          formerMarkerMatches: state.clips.filter((clip) =>
            rootCase.markers.includes(clip.content)
          ).length,
          nextMarkerMatches: state.clips.filter(
            (clip) => clip.content === rootCase.nextMarker
          ).length,
          autoSync: state.autoSync,
          localRetentionMs: state.localRetentionMs,
          deviceNameMatchesExpected:
            state.identity!.deviceName === rootCase.expectedDeviceName,
          nextMarkerOriginMatches: state.clips.filter(
            (clip) =>
              clip.content === rootCase.nextMarker &&
              clip.originPeerId === state.identity!.deviceId
          ).length,
          resetPhase: state.identityResetState.phase,
        });
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        busy = false;
      }
    };
    const read = (cursor: number) => {
      insist();
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > ledger.length)
        throw Error("invalid_cursor");
      return {
        caseId: rootCase.caseId,
        workerIncarnation,
        failed,
        rows: ledger.slice(cursor, cursor + 4).map((row) => ({ ...row })),
        nextCursor: Math.min(cursor + 4, ledger.length),
        totalRows: ledger.length,
      };
    };
    listener = (message: unknown, sender, reply) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "clipp-reset-owning-read"
      )
        return;
      const request = message as Record<string, unknown>;
      const allowed =
        sender.id === chrome.runtime.id &&
        sender.url === chrome.runtime.getURL("reset-owning-witness.html") &&
        request.caseId === rootCase.caseId &&
        ((request.command === "read" &&
          Object.keys(request).length === 4 &&
          Object.prototype.hasOwnProperty.call(request, "cursor")) ||
          (request.command === "observe-once" &&
            Object.keys(request).length === 3));
      if (!allowed) {
        reply({ ok: false, error: "owning_read_refused" });
        return false;
      }
      if (request.command === "read") {
        try {
          reply({ ok: true, value: read(request.cursor as number) });
        } catch {
          reply({ ok: false, error: "owning_observation_unconfirmed" });
        }
        return false;
      }
      void observeOnce().then(
        (value) => reply({ ok: true, value }),
        () => reply({ ok: false, error: "owning_observation_unconfirmed" })
      );
      return true;
    };
    chrome.runtime.onMessage.addListener(listener);
    let completion: Promise<void> = Promise.resolve();
    if (rootCase.mode === "execute" && !replay) {
      const verifyPreflight = async () => {
        insist();
        if (Date.now() > rootCase.executeAfterUnixMs + 2000)
          throw Error("execute_window_missed");
        const state = await getState();
        const configurationSha256 = await wait(hashConfigurations(state));
        insist();
        if (
          state.identity?.deviceId !== rootCase.reviewedPeerId ||
          state.identityResetState.phase !== "idle" ||
          state.identityResetState.receipt ||
          state.autoSync !== rootCase.expected.autoSync ||
          state.localRetentionMs !== rootCase.expected.localRetentionMs ||
          configurationSha256 !== rootCase.expected.configurationSha256 ||
          state.identity.deviceName !== rootCase.expectedDeviceName ||
          state.pinnedIds.length !== rootCase.expected.pinnedCount ||
          state.clips.length !== rootCase.markers.length ||
          !rootCase.markers.every(
            (marker) =>
              state.clips.filter((clip) => clip.content === marker).length === 1
          )
        )
          throw Error("preflight_mismatch");
      };
      if (
        initial.identity?.deviceId !== rootCase.reviewedPeerId ||
        initial.identityResetState.phase !== "idle" ||
        initial.identityResetState.receipt
      )
        throw Error("preflight_mismatch");
      // Session pins may be restored through normal UI until the fixed root time.
      completion = new Promise<void>((resolve, reject) => {
        rejectScheduled = reject;
        scheduled = setTimeout(
          () => {
            void (async () => {
              await verifyPreflight();
              insist();
              if (
                Date.now() < rootCase.executeAfterUnixMs ||
                Date.now() > rootCase.executeAfterUnixMs + 2000
              )
                throw Error("execute_window_missed");
              append({
                stage: "begin-requested",
                operationId: rootCase.operationId,
                formerPeerId: rootCase.reviewedPeerId,
              });
              const result = await wait(
                owner!.identityReset.begin({
                  operationId: rootCase.operationId,
                  reviewedPeerId: rootCase.reviewedPeerId,
                })
              );
              insist();
              append({
                stage: "begin-returned",
                outcome: result.outcome,
                restartRequired: true,
              });
            })().then(resolve, (error) => {
              failed = true;
              reject(error);
            });
          },
          Math.max(0, rootCase.executeAfterUnixMs - Date.now())
        );
      });
      void completion.catch(() => undefined);
    }
    return { observeOnce, read, stop, completion, handleRead: listener };
  } catch (error) {
    await stop();
    throw error;
  }
}
