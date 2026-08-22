# 02 — Complete Android Clip ingress and application recovery

**What to build:** Let Android users immediately send selected or shared text into their Device Network and recover one failed live Remote Clip clipboard write, while preserving Clip identity, trust, retention, and the non-disruptive semantics of Clipboard History Reconciliation.

**Blocked by:** 01 — Deliver opt-in Android 16 background continuity.

**Status:** resolved

- [x] Expose Clipp as a compatible Android text-selection action for `text/plain` selected text and as a `text/plain` Android Sharesheet destination.
- [x] Treat both system actions as immediate Share Now actions without a confirmation or recipient screen.
- [x] Validate supplied intent text and never implement either action by rereading the system clipboard.
- [x] Persist the supplied raw text before reporting it as accepted or queued, including cold-start and warm `singleTask` delivery.
- [x] Keep a queued explicit action distinct from a Clip until the initialized Device Identity processes it; do not invent a provisional Clip ID or identity.
- [x] Bring Clipp forward when a user-initiated cold action needs the Activity-owned WebView runtime; do not imply that the shell foreground service can process the action alone.
- [x] Drain every accepted action exactly once through the shared local-text capture path with Share Now enabled, marking it complete only after its Local Clip is durably accepted.
- [x] Provide brief content-free accepted, queued, or failed feedback and never claim success when ingress persistence or Clip acceptance failed.
- [x] Preserve event identity so repeated user actions with identical text create distinct Local Clips, while restart recovery of one queued action creates only one Clip.
- [x] Apply the existing supported-content, normalization, frame-bound, Clip Sharing Lifetime, Clipboard History, Auto Sync override, Trusted Device scope, and Clip Suppression Tombstone rules.
- [x] Offer accepted disconnected shares through existing live gossip and Clipboard History Reconciliation after reconnection without claiming per-device acknowledgement or guaranteed delivery.
- [x] Preserve the Remote Clip receive order of authenticated Active Member authorization, validation, durable acceptance, and only then Android clipboard application.
- [x] Continue to apply a new live Remote Clip automatically while the WebView and Capacitor bridge remain healthy, accepting Android's system-controlled clipboard preview.
- [x] Persist at most one Android pending-application marker after a live Remote Clip clipboard write fails; the marker identifies the existing Clip and does not create a new event.
- [x] Replace an older pending marker when a newer eligible live Remote Clip cannot be applied, so recovery never replays a stale sequence of clipboard values.
- [x] Retry the newest pending live Remote Clip at most once when the Activity resumes, and only while it remains retained, unsuppressed, learned through the live path, and Auto Sync is enabled.
- [x] Clear the pending marker after successful application, one failed retry, ineligibility, local Clip removal, history clearing, Identity Rotation, or replacement by a newer eligible live Remote Clip.
- [x] Never create pending application work from Clipboard History Reconciliation and never apply an imported historical Clip to the system clipboard.
- [x] Preserve Pairing, Device Membership, Device Revocation, immediate-sender authentication, and Active Member authorization without adding authority to Android intent payloads.
- [x] Add deterministic coverage for selected-text and Sharesheet discovery, cold and warm ingress, process restart before drain, identical repeated actions, partial persistence failure, exactly-once completion, and disabled Auto Sync Share Now behavior.
- [x] Add deterministic coverage for successful background application, initial write failure, newer-live replacement, one resume retry, second failure clearing, Auto Sync cancellation, local deletion, history clearing, Identity Rotation, and historical-import exclusion.
- [x] Keep shared runtime conformance, Clip synchronization, Clipboard History Reconciliation, lint, and Android build checks green.

## Answer

- Added Android `PROCESS_TEXT` and `SEND text/plain` ingress that durably queues raw intent text before acknowledgement, starts the Activity-owned runtime only for cold delivery, and drains through the shared explicit-capture path with stable event identity.
- Added restart-safe exactly-once completion using durable history lookup, content-free native feedback, and deterministic cold/warm, repeated-action, persistence-failure, and recovery coverage.
- Added one-slot pending Remote Clip application recovery. It records only failed eligible live applications, retries once on resume, and clears or replaces the marker at every specified lifecycle boundary.
- Extended runtime capability reporting and clipboard synchronization callbacks without changing trust authority, retention, reconciliation, or historical-import behavior.
