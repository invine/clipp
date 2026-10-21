# Android pending Clip Sharing Lifetime acceptance

These are **unrun acceptance sources**. They change only the androidTest APK. The
ordinary production MainActivity/AndroidApp and its real native queue, settings,
clipboard factory and IndexedDB remain the owners. Root builds, reviews and runs
them under a fresh isolated guest/network/clipboard-sharing assignment.

Invoke the methods separately in this order; never run the whole class as an
unordered suite. Keep the same app data, nonce and candidate between phases.

1. `ClipPolicyPendingInputTest#phaseA_pendingNativeEventKeepsOriginalLifetimeWhilePolicyChangesBeforeAbruptStop`
2. Root reads the actual existing IndexedDB row and force-stops the owned process
   **during** A's `READY_TO_FORCESTOP` hold, proving its PID is gone.
3. `ClipPolicyPendingInputTest#phaseB_newProcessReplaysPreparedEventOnceWithOriginalDeadline`

Both invocations require `clipPolicyPendingAcceptance=true`,
`clipPolicyPendingPhase=A` or `B`, `clipPolicyPendingNonce` matching
`[A-Za-z0-9-]{1,32}` and `clipPolicyPendingWitnessHoldMs=30000`. Only the
isolated `com.clipp.app.acceptance` package with packaged production assets and
`https://localhost/` is accepted. Use an ordinary guest size/font profile; this
case does not qualify layout extremes.

A starts with genuine default policies, saves retention seven days and sharing
one hour through the real native selects, then sends one actual exported SEND
Intent containing `clip-policy-pending-<nonce>`. Its test-only public IndexedDB
wrapper delegates the real `put` unchanged. Only that marker's History item in
the actual `clipp-history` / `history` readwrite transaction is selected. An
additive real request-success listener calls that transaction's real `abort`.
This is **controlled native-runtime transaction failure**, not a spontaneous
disk outage or a fake backend/request. Reads and native settings remain live.

A requires a real abort, zero target transaction completes, truthful pending
storage UI, no public card, the actual durably prepared native action, and a
successful real sharing-policy change to seven days while the prepared event
keeps its original one-hour lifetime. The asset has an immutable 120-second
deadline, at most 64 attempts/timeline entries and a 32KiB snapshot. Descriptor
collisions, changed event metadata, deadline/overflow or commit fail the case;
cleanup restores only its own exact platform descriptor.

At `READY_TO_FORCESTOP`, capture the nonce, actual PID, original action/event,
current policies and the saved bounded witness artifact. Use the separately
reviewed root asynchronous readonly IndexedDB collector, not synchronous
`evaluateJavascript`, to require absence of this known original Clip ID in the
existing active generation. Abort on upgrade and never create/seed the DB.
Force-stop only the owned package before the 30-second hold ends. A's killed
instrumentation is an **expected interrupted phase with a proved checkpoint**,
never a JUnit PASS. If A returns normally, fails before checkpoint or expires,
preserve that failure; do not promote it.

B additionally requires A's checkpoint values as:

- `clipPolicyPendingFormerPid`
- `clipPolicyPendingActionId`
- `clipPolicyPendingClipId`
- `clipPolicyPendingCapturedAt`
- `clipPolicyPendingShareExpiresAt`
- `clipPolicyPendingOriginPeerId`

B checks the new actual PID, saved seven-day policy and still-prepared matching
native action **before launching MainActivity**. It installs no fault and sends
no new Intent. Normal startup/resume must replay and complete that action,
produce exactly one current Local card with the original ID and clear the
pending issue. At `READY_READONLY_WITNESS` root must independently read the real
durable Clip fields and local metadata and compare them with A. The original
ID/content/origin/capturedAt/shareExpiresAt stay fixed. An aborted attempt's
`firstStoredAt` is not durable: final `firstStoredAt` belongs to successful B
acceptance bounds. After B's native Settings leave/return, the root rereads the
same fields during `FINAL_READONLY_WITNESS`; metadata must remain unchanged.

The actual new Clip may have `shareNowPending=true`; that is outbound work after
History acceptance, not the pre-acceptance pending state being tested. Sharing
expiry does not delete retained local History. No remote delivery is asserted.

Root retains exact source/asset/APK hashes, original interrupted A status, B
JUnit status, both real PID/force-stop receipts, native queue/policy evidence,
readonly storage snapshots and complete owned guest/forward/firewall/Qt cleanup.
No aggregate qualification follows if one contributor is missing. Do not reuse
finished ACTIVE manifests, clear data, re-send the marker, call private product
APIs, directly seed native queues/History, or construct a second runtime.

This case does not qualify reader/open failure, native preference commit or
poisoned-read recovery, retention cleanup followed by preference-write partial
effects, native prepare/complete persistence failure, suppression under failed
cleanup, physical Sharesheet selection, remote enforcement, host clipboard or
all of ticket20. Existing source/core fault tests and prior native A/B/C retain
their own scopes. Root owns any subsequent refinement, required gates and
canonical status; these files supply no native pass or completed host scope.

The separate maintained `retention-pending-transaction.mjs` harness checks this
asset through the exact Java installation expression on a fresh route-fulfilled
Chromium origin and real IndexedDB. Root can additionally select
`--setup-failure-after-profile` (a genuine ENOENT read under the fresh profile) or
`--launch-timeout-1ms` (the actual public Playwright launch timeout). Both remain
failed execution outcomes; root separately audits whether the requested failure
and complete cleanup were observed. They mock neither browser nor IndexedDB.
Launch is awaited through settlement before any absence claim/profile removal.
These platform-fixture checks do not establish Android native replay.
