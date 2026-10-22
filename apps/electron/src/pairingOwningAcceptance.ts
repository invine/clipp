import { isAbsolute } from "node:path";

type Observation = Readonly<Record<string, unknown>>;
type Manifest = Readonly<{
  version: 1;
  caseId: string;
  deadlineUnixMs: number;
  profile: string;
}>;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function peerIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (id) => typeof id === "string" && /^[A-Za-z0-9]{32,128}$/.test(id)
    )
  );
}

function parse(text: string): Manifest {
  if (Buffer.byteLength(text, "utf8") > 8192)
    throw new Error("invalid_pairing_manifest");
  const value: unknown = JSON.parse(text);
  if (!object(value)) throw new Error("invalid_pairing_manifest");
  const record = value;
  if (
    Object.keys(record).sort().join(",") !==
      "caseId,deadlineUnixMs,profile,version" ||
    record.version !== 1 ||
    typeof record.caseId !== "string" ||
    !/^g01_[0-9a-f]{32}$/.test(record.caseId) ||
    typeof record.profile !== "string" ||
    record.profile.length > 4096 ||
    !isAbsolute(record.profile) ||
    /[\x00-\x1f\x7f]/.test(record.profile) ||
    typeof record.deadlineUnixMs !== "number" ||
    !Number.isSafeInteger(record.deadlineUnixMs) ||
    record.deadlineUnixMs <= Date.now() ||
    record.deadlineUnixMs > Date.now() + 600000
  )
    throw new Error("invalid_pairing_manifest");
  return Object.freeze({
    version: 1,
    caseId: record.caseId,
    profile: record.profile,
    deadlineUnixMs: record.deadlineUnixMs,
  });
}

let started = false;

/**
 * Separate opt-in export; normal main never imports this file. The root wrapper
 * first admits a fresh process, retained private profile, current code/vendor
 * and native SQLite, and owns the absolute600s lifetime/15s native retirement.
 * Only the clipboard OS boundary is process-local. All runtime, storage,
 * Pairing, Membership, capture and transport composition below is production.
 */
export async function startElectronPairingOwningAcceptance(
  text: string,
  emit: (row: Observation) => void
) {
  const manifest = parse(text);
  if (started) throw new Error("pairing_owner_already_started");
  started = true;
  const monotonicEnd = performance.now() + manifest.deadlineUnixMs - Date.now();
  const electronMarker = `clipp-g01-${manifest.caseId}-electron-to-android`;
  const androidMarker = `clipp-g01-${manifest.caseId}-android-to-electron`;
  type Owner = Awaited<
    ReturnType<typeof import("./electronRuntime.js").startElectronRuntime>
  >;
  let owner: Owner | undefined;
  let stopped: Promise<void> | undefined;
  let closed = false;
  let memoryClipboard = "";
  let rows = 0,
    bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  void deadline.catch(() => undefined);
  const active = () =>
    !closed &&
    Date.now() < manifest.deadlineUnixMs &&
    performance.now() < monotonicEnd;
  const current = () => {
    if (!active()) throw new Error("pairing_interval_closed");
  };
  const publish = (stage: string, fields: Observation = {}) => {
    const row = { version: 1, caseId: manifest.caseId, stage, ...fields };
    const encoded = JSON.stringify(row);
    if (
      ++rows > 1024 ||
      Buffer.byteLength(encoded) > 8192 ||
      (bytes += Buffer.byteLength(encoded)) > 1048576
    )
      throw new Error("pairing_observation_cap");
    emit(row);
    return row;
  };
  const quiet = (stage: string) => {
    try {
      publish(stage);
    } catch {
      /* No dialog on evidence failure. */
    }
  };
  const observation = (stage: string, fields: Observation) => {
    current();
    const row = publish(stage, fields);
    current();
    return row;
  };
  const stop = () =>
    (stopped ??= (async () => {
      closed = true;
      clearTimeout(timer);
      try {
        await owner?.stop();
      } finally {
        quiet("stopped");
      }
      // Keep text ports inert until native process exit; never restore a host
      // clipboard delegate while a late product callback might still exist.
    })());
  const bounded = async <T>(operation: Promise<T>): Promise<T> => {
    const result = await Promise.race([operation, deadline]);
    current();
    return result;
  };
  timer = setTimeout(
    () => {
      closed = true;
      rejectDeadline(new Error("pairing_deadline"));
      quiet("deadline-expired");
      void stop().catch(() => quiet("stop-unconfirmed"));
    },
    Math.max(
      0,
      Math.min(
        manifest.deadlineUnixMs - Date.now(),
        monotonicEnd - performance.now()
      )
    )
  );
  try {
    const { app, clipboard } = await bounded(import("electron"));
    if (
      app.getPath("userData") !== manifest.profile ||
      app.getPath("sessionData") !== manifest.profile ||
      process.env.VITE_DEV_SERVER_URL ||
      process.env.CLIPP_RELAY_ACCEPTANCE_PROFILE ||
      process.env.CLIPP_RELAY_ACCEPTANCE_TRANSPORT
    )
      throw new Error("root_owned_normal_profile_required");
    clipboard.readText = () => {
      current();
      return memoryClipboard;
    };
    clipboard.writeText = (value: string) => {
      current();
      if (
        typeof value !== "string" ||
        Buffer.byteLength(value) > 65536 ||
        (value !== electronMarker &&
          value !== androidMarker &&
          !value.startsWith("clipp:pair:"))
      )
        throw new Error("unknown_clipboard_value_refused");
      memoryClipboard = value;
    };
    const runtime = await bounded(import("./electronRuntime.js"));
    const creating = runtime
      .startElectronRuntime({
        nativeListenInterface: "127.0.0.1",
        enableWebSocketListener: true,
        enableMdns: false,
        enableTcp: false,
        enableWebRTCDirect: false,
        enableDCUtR: false,
      })
      .then(async (value) => {
        owner = value;
        if (!active()) await value.stop();
        return value;
      });
    await bounded(creating);
    if (!owner) throw new Error("pairing_owner_unavailable");
    await bounded(owner.ready);
    const snapshot = async () => {
      const state = await bounded(owner!.publicState());
      if (
        !state.identity ||
        state.identityRotationRecovery ||
        state.historyUnavailable ||
        state.historyRefreshError ||
        state.managedRelayConfigurations.length !== 0 ||
        state.relayAddresses.length !== 0 ||
        state.relayConnections.length !== 0
      )
        throw new Error("normal_empty_managed_settings_required");
      if (
        app.getPath("userData") !== manifest.profile ||
        app.getPath("sessionData") !== manifest.profile
      )
        throw new Error("owned_profile_changed");
      return state;
    };
    const initial = await snapshot();
    const identity = initial.identity!;
    if (
      initial.devices.length ||
      initial.pending.length ||
      initial.waiting.length ||
      initial.clips.length ||
      identity.membershipView?.admittedPeerIds.length !== 1 ||
      identity.membershipView.admittedPeerIds[0] !== identity.deviceId ||
      identity.membershipView.revokedPeerIds.length
    )
      throw new Error("fresh_singleton_required");
    const observe = async () => {
      const state = await snapshot();
      if (
        state.devices.length > 8 ||
        state.pending.length > 8 ||
        state.waiting.length > 8 ||
        state.pairingState.outcomes.length > 8 ||
        state.peerConnections.length > 8 ||
        state.clips.length > 32
      )
        throw new Error("pairing_state_cap");
      return observation("public-observation", {
        peerId: state.identity!.deviceId,
        membership: state.identity!.membershipView,
        devices: state.devices.map((device) => ({ peerId: device.deviceId })),
        pending: state.pending.map((request) => ({
          peerId: request.deviceId,
          requestVersion: request.requestVersion,
        })),
        waiting: state.waiting,
        outcomes: state.pairingState.outcomes,
        connections: state.peerConnections,
        autoSync: state.autoSync,
        clips: state.clips
          .filter(
            (clip) =>
              clip.content === electronMarker || clip.content === androidMarker
          )
          .map((clip) => ({
            id: clip.id,
            originPeerId: clip.originPeerId,
            marker:
              clip.content === electronMarker
                ? "electron-to-android"
                : "android-to-electron",
          })),
        totalClipCount: state.clips.length,
        clipboard:
          memoryClipboard === electronMarker
            ? "electron-to-android"
            : memoryClipboard === androidMarker
              ? "android-to-electron"
              : memoryClipboard.startsWith("clipp:pair:")
                ? "public-qr-copy"
                : "empty",
        hostClipboardUsed: false,
        nativeOrWholeG01Qualified: false,
      });
    };
    observation("owner-ready", {
      peerId: identity.deviceId,
      electronMarker,
      androidMarker,
      hostClipboardUsed: false,
    });
    return Object.freeze({
      observe,
      setElectronMarker() {
        current();
        memoryClipboard = electronMarker;
        current();
      },
      async copiedPairingTarget() {
        current();
        const copied = memoryClipboard;
        if (
          !copied.startsWith("clipp:pair:") ||
          Buffer.byteLength(copied) > 65536
        )
          throw new Error("actual_public_qr_copy_required");
        const { decodePairingTarget } = await bounded(
          import("../../../packages/core/pairing/v2.js")
        );
        const { verifiedSignedPeerRecordMultiaddrs } = await bounded(
          import("../../../packages/core/network/peerRecords.js")
        );
        const target = decodePairingTarget(copied);
        const state = await snapshot();
        if (!target || target.targetPeerId !== state.identity!.deviceId)
          throw new Error("copied_target_identity_mismatch");
        const addresses = await bounded(
          verifiedSignedPeerRecordMultiaddrs(
            target.signedPeerRecord,
            target.targetPeerId
          )
        );
        if (
          addresses.length !== 1 ||
          !/^\/ip4\/127\.0\.0\.1\/tcp\/[1-9][0-9]{0,4}\/ws\/p2p\/[^/]+$/.test(
            addresses[0]
          )
        )
          throw new Error("sole_signed_loopback_ws_required");
        const port = Number(addresses[0].split("/")[4]);
        if (port > 65535) throw new Error("invalid_listener_port");
        const latest = await snapshot();
        if (
          memoryClipboard !== copied ||
          latest.identity!.deviceId !== target.targetPeerId
        )
          throw new Error("copied_target_retired");
        return {
          text: copied,
          peerId: target.targetPeerId,
          addresses,
          port,
          actualSocketOwnershipStillRequired: true,
        };
      },
      async durableMembership() {
        await snapshot();
        const { default: Database } = await bounded(import("better-sqlite3"));
        const { join } = await bounded(import("node:path"));
        const db = new Database(join(manifest.profile, "clipp.sqlite"), {
          readonly: true,
          fileMustExist: true,
          timeout: 1000,
        });
        let stored: unknown;
        try {
          const row = db
            .prepare("SELECT value FROM kv WHERE key = ?")
            .get("localDeviceIdentity");
          current();
          if (
            !row ||
            typeof row.value !== "string" ||
            Buffer.byteLength(row.value) > 65536
          )
            throw new Error("bounded_durable_identity_required");
          stored = JSON.parse(row.value);
        } finally {
          db.close();
        }
        current();
        const state = await snapshot();
        if (
          !object(stored) ||
          stored.deviceId !== state.identity!.deviceId ||
          !object(stored.membershipView) ||
          !peerIds(stored.membershipView.admittedPeerIds) ||
          !peerIds(stored.membershipView.revokedPeerIds)
        )
          throw new Error("durable_membership_unavailable");
        // Never emit the private-key-bearing persisted identity object.
        return observation("durable-membership", {
          peerId: stored.deviceId,
          admittedPeerIds: stored.membershipView.admittedPeerIds,
          revokedPeerIds: stored.membershipView.revokedPeerIds,
        });
      },
      stop,
    });
  } catch (error) {
    quiet("entry-unconfirmed");
    await stop();
    throw error;
  }
}
