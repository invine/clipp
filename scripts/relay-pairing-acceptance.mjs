/** Joint case over the maintained owning runners; each retains its own attempt ledger. */
import assert from "node:assert/strict";
import { acquireOwnedRelayProfile } from "../apps/extension/scripts/owned-relay-profile.mjs";
import {
  runToolbarAcceptance,
  targetGone,
} from "../apps/extension/scripts/toolbar-acceptance.mjs";
import { raceAcceptanceOperation } from "../apps/extension/scripts/clipboard-acceptance.mjs";

export async function runRelayPairing(args, record, runElectron) {
  assert(
    Array.isArray(record.chromeArguments) &&
      record.chromeArguments.length <= 64 &&
      record.chromeArguments.every(
        (value) => typeof value === "string" && value.length <= 4096
      ),
    "pairing_chrome_arguments_required"
  );
  const chromeOptions = {};
  for (let index = 0; index < record.chromeArguments.length; index += 2) {
    const flag = record.chromeArguments[index],
      value = record.chromeArguments[index + 1];
    assert(
      flag.startsWith("--") &&
        value &&
        !value.startsWith("--") &&
        !Object.hasOwn(chromeOptions, flag.slice(2)),
      "pairing_chrome_arguments_required"
    );
    chromeOptions[flag.slice(2)] = value;
  }
  const option = (values, name) => {
    const index = values.indexOf(`--${name}`);
    return index < 0 ? undefined : values[index + 1];
  };
  assert(
    option(record.chromeArguments, "registered-extension-id") ===
      record.registeredExtensionId &&
      option(record.chromeArguments, "scenario") === "toolbar-relay-pairing",
    "pairing_registration_mapping_mismatch"
  );
  const discovery = option(args, "discovery");
  assert(
    option(record.chromeArguments, "discovery") === discovery &&
      option(record.chromeArguments, "effort") === option(args, "effort") &&
      option(record.chromeArguments, "candidate-record") ===
        option(args, "candidate-record") &&
      !record.chromeArguments.includes("--validate-only") &&
      !record.chromeArguments.includes("--freeze-extension"),
    "pairing_semantic_case_mismatch"
  );
  const maximumMs = Number(option(args, "timeout-seconds") ?? 600) * 1000;
  assert(
    Number.isSafeInteger(maximumMs) && maximumMs > 0 && maximumMs <= 600000,
    "pairing_timeout_invalid"
  );
  const profileLease = await acquireOwnedRelayProfile(chromeOptions, {
    preparation: false,
    verifyClosed: targetGone,
  });
  const deadline = Date.now() + maximumMs;
  const peers = {},
    admissions = {},
    cleanups = {},
    cleanupDeadlines = {};
  let cleanupTimer,
    cleanupDecided = false,
    resolveCleanup;
  const cleanupDecision = new Promise((resolve) => {
    resolveCleanup = resolve;
  });
  function decideCleanup(passed) {
    if (cleanupDecided) return;
    cleanupDecided = true;
    clearTimeout(cleanupTimer);
    resolveCleanup(passed);
  }
  function arriveCleanup(name, receipt, deadline) {
    cleanups[name] = receipt;
    cleanupDeadlines[name] = deadline;
    if (cleanupDecided) return cleanupDecision;
    clearTimeout(cleanupTimer);
    const earliest = Math.min(...Object.values(cleanupDeadlines));
    if (
      !Number.isFinite(earliest) ||
      Date.now() >= earliest ||
      Object.values(cleanups).some((value) => value.result !== "passed")
    )
      decideCleanup(false);
    else if (Object.keys(cleanups).length === 2)
      decideCleanup(
        cleanups.electron.shutdown === "graceful" &&
          cleanups.chrome.shutdown === "verified-owned-browser-closed"
      );
    else
      cleanupTimer = setTimeout(
        () => decideCleanup(false),
        earliest - Date.now()
      );
    return cleanupDecision;
  }
  let stopped;
  function remaining() {
    if (stopped) throw stopped;
    const value = Math.min(
      deadline - Date.now(),
      ...Object.values(admissions).map((value) =>
        value.attempt.remainingMs(maximumMs)
      )
    );
    assert(value > 0, "pairing_deadline_exhausted");
    return value;
  }
  async function bounded(operation) {
    const value = await raceAcceptanceOperation(
      operation,
      remaining(),
      "joint_relay_pairing"
    );
    remaining();
    return value;
  }
  async function until(probe, reason) {
    for (;;) {
      const value = await bounded(probe);
      if (value) return value;
      if (remaining() <= 50) throw new Error(reason);
      await bounded(() => new Promise((done) => setTimeout(done, 50)));
    }
  }
  let journey;
  const hooks = (name) => ({
    pairingRecord: record,
    profileLease,
    maximumMs,
    async beforeNative(admission) {
      admissions[name] = admission;
      await until(
        () => Object.keys(admissions).length === 2,
        "pairing_admission_incomplete"
      );
      assert(
        admissions.electron.revision === admissions.chrome.revision,
        "pairing_candidate_revision_mismatch"
      );
      if (name === "chrome")
        await until(
          () => peers.electron,
          "pairing_electron_preflight_incomplete"
        );
    },
    async onReady(peer) {
      peers[name] = peer;
      await until(
        () => peers.electron && peers.chrome,
        "pairing_runtime_unavailable"
      );
      journey ??= performPairing(peers, bounded, until, discovery);
      try {
        return await journey;
      } catch (error) {
        stopped = error;
        throw error;
      }
    },
    async afterCleanup(receipt, { deadline }) {
      if (receipt.result !== "passed")
        stopped ??= new Error("pairing_companion_failed");
      // One decision is made at the second arrival or the earliest owner's
      // deadline, then shared by both callers. Late polling cannot revoke a pass
      // already observed by the companion's immutable receipt.
      assert(
        await arriveCleanup(name, receipt, deadline),
        "joint_cleanup_unconfirmed"
      );
    },
  });
  async function run(name, operation) {
    try {
      return await operation();
    } catch (error) {
      stopped ??= error;
      if (!cleanups[name])
        arriveCleanup(
          name,
          { result: "failed", shutdown: "not-launched" },
          Date.now()
        );
      throw error;
    }
  }
  try {
    const results = await Promise.allSettled([
      run("electron", () => runElectron(args, hooks("electron"))),
      run("chrome", () =>
        runToolbarAcceptance(record.chromeArguments, hooks("chrome"))
      ),
    ]);
    for (const result of results)
      if (result.status === "rejected") throw result.reason;
    return results[0].value;
  } finally {
    await profileLease.releaseUnlaunched();
  }
}

async function performPairing({ electron, chrome }, bounded, until, discovery) {
  const read = async () =>
    Promise.all([bounded(electron.readState), bounded(chrome.readState)]);
  const chromeTransport = await bounded(chrome.readTransportStatus);
  assert(
    chromeTransport?.started === true &&
      chromeTransport.relayAcceptanceTransport === "wss" &&
      chromeTransport.acceptanceMemoryClipboard === true,
    "pairing_forced_relay_runtime_required"
  );
  const initial = await read();
  const ids = initial.map((state) => state?.identity?.deviceId);
  assert(
    ids[1] === chrome.expectedDeviceId &&
      ids.every(
        (id) => typeof id === "string" && /^[A-Za-z0-9]{20,128}$/.test(id)
      ) &&
      ids[0] !== ids[1],
    "pairing_independent_identity_required"
  );
  function ready(state) {
    const configurations =
      state.managedRelayConfigurations?.filter(
        (config) =>
          config.kind === "managed" && config.discoveryUrl === discovery
      ) ?? [];
    assert(
      configurations.length <= 1,
      "pairing_owned_relay_configuration_required"
    );
    if (!configurations.length) return null;
    const states =
      state.managedRelayStates?.filter(
        (value) =>
          value.key === configurations[0].key && value.kind === "managed"
      ) ?? [];
    return states.length === 1 &&
      states[0].status === "ready" &&
      /^[A-Za-z0-9]{20,128}$/.test(states[0].peerId ?? "")
      ? states[0].peerId
      : null;
  }
  console.log(
    "Rechecking the prepared owning relay sessions. If either requires login, use the explicit account-preparation phase before another Pairing attempt."
  );
  const relay = await raceAcceptanceOperation(
    () =>
      until(async () => {
        const states = await read();
        assert(
          states.every((state) =>
            state.managedRelayConfigurations?.some(
              (config) =>
                config.kind === "managed" && config.discoveryUrl === discovery
            )
          ) &&
            states.every(
              (state) =>
                !state.managedRelayStates?.some((value) =>
                  ["login_needed", "refused"].includes(value.status)
                )
            ),
          "pairing_account_preparation_required"
        );
        const a = ready(states[0]),
          b = ready(states[1]);
        return a && a === b ? a : null;
      }, "pairing_both_owned_relays_not_ready"),
    30000,
    "prepared_relay_session_recheck"
  );
  function member(state, id) {
    return (
      state.identity?.membershipView?.admittedPeerIds?.includes(id) &&
      !state.identity.membershipView.revokedPeerIds?.includes(id)
    );
  }
  assert(
    !member(initial[0], ids[1]) &&
      !member(initial[1], ids[0]) &&
      !initial[0].pending?.some((value) => value.deviceId === ids[1]) &&
      !initial[1].waiting?.some((value) => value.targetPeerId === ids[0]),
    "pairing_fresh_counterpart_required"
  );
  await bounded(() => electron.click("Devices"));
  await bounded(() => electron.click("Pair this device"));
  await bounded(() => electron.click("Show my QR"));
  await bounded(() => electron.click("Copy pairing text"));
  // The normal UI decoder and networking adapter validate this public signed
  // target before a request can arrive. Keep it in memory and out of receipts.
  const target = await bounded(electron.copyTarget);
  assert(
    typeof target === "string" &&
      /^clipp:pair:[A-Za-z0-9_-]+$/.test(target) &&
      Buffer.byteLength(target) <= 22000,
    "pairing_public_signed_target_required"
  );
  await bounded(chrome.open);
  for (const label of ["Devices", "Pair this device", "Paste pairing text"])
    await bounded(() => chrome.click(label));
  await bounded(() => chrome.typeTarget(target));
  await bounded(() => chrome.click("Submit pairing text"));
  function route(state, peer) {
    const connection = state.peerConnections?.find(
      (value) => value.peerId === peer
    );
    assert(!connection?.hasDirect, "pairing_direct_route_forbidden");
    return (
      connection?.hasDirect === false &&
      connection?.hasRelay === true &&
      connection.addrs?.some((address) =>
        address.includes(`/p2p/${relay}/p2p-circuit/`)
      )
    );
  }
  await until(async () => {
    const states = await read();
    assert(
      states[0].identity.deviceId === ids[0] &&
        states[1].identity.deviceId === ids[1],
      "pairing_identity_changed"
    );
    return (
      states[0].pending?.some((value) => value.deviceId === ids[1]) &&
      route(states[0], ids[1]) &&
      route(states[1], ids[0])
    );
  }, "pairing_signed_request_unobserved");
  await bounded(() => electron.click("Requests"));
  await bounded(() =>
    electron.click("Accept", `[data-session-focus="request:${ids[1]}"]`)
  );
  await until(async () => {
    const states = await read();
    assert(
      states[0].identity.deviceId === ids[0] &&
        states[1].identity.deviceId === ids[1],
      "pairing_identity_changed"
    );
    return (
      member(states[0], ids[1]) &&
      member(states[1], ids[0]) &&
      states[0].devices?.some((value) => value.deviceId === ids[1]) &&
      states[1].devices?.some((value) => value.deviceId === ids[0]) &&
      route(states[0], ids[1]) &&
      route(states[1], ids[0]) &&
      ready(states[0]) === relay &&
      ready(states[1]) === relay
    );
  }, "pairing_reciprocal_membership_unobserved");
  await bounded(chrome.open);
  await bounded(() => chrome.click("Requests"));
  await bounded(() => chrome.observeAcceptance(ids[0]));
  return {
    case: "chrome-electron-relay-accept",
    normalSignedTarget: true,
    nativeAccept: true,
    bothOwnedRelayReady: true,
    forcedRelayTransport: "wss",
    relayOnly: true,
    reciprocalMembership: true,
    chromeAcceptanceVisible: true,
    scope: "accept-only; reject, restart and exchange untested",
  };
}
