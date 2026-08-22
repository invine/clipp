# 02 — Complete Android Clip ingress and application recovery

**What to build:** Let Android users immediately send selected or shared text into their Device Network and recover one failed live Remote Clip clipboard write, while preserving Clip identity, trust, retention, and the non-disruptive semantics of Clipboard History Reconciliation.

**Blocked by:** 01 — Deliver opt-in Android 16 background continuity.

**Status:** ready-for-agent

- [ ] Expose Clipp as a compatible Android text-selection action for `text/plain` selected text and as a `text/plain` Android Sharesheet destination.
- [ ] Treat both system actions as immediate Share Now actions without a confirmation or recipient screen.
- [ ] Validate supplied intent text and never implement either action by rereading the system clipboard.
- [ ] Persist the supplied raw text before reporting it as accepted or queued, including cold-start and warm `singleTask` delivery.
- [ ] Keep a queued explicit action distinct from a Clip until the initialized Device Identity processes it; do not invent a provisional Clip ID or identity.
- [ ] Bring Clipp forward when a user-initiated cold action needs the Activity-owned WebView runtime; do not imply that the shell foreground service can process the action alone.
- [ ] Drain every accepted action exactly once through the shared local-text capture path with Share Now enabled, marking it complete only after its Local Clip is durably accepted.
- [ ] Provide brief content-free accepted, queued, or failed feedback and never claim success when ingress persistence or Clip acceptance failed.
- [ ] Preserve event identity so repeated user actions with identical text create distinct Local Clips, while restart recovery of one queued action creates only one Clip.
- [ ] Apply the existing supported-content, normalization, frame-bound, Clip Sharing Lifetime, Clipboard History, Auto Sync override, Trusted Device scope, and Clip Suppression Tombstone rules.
- [ ] Offer accepted disconnected shares through existing live gossip and Clipboard History Reconciliation after reconnection without claiming per-device acknowledgement or guaranteed delivery.
- [ ] Preserve the Remote Clip receive order of authenticated Active Member authorization, validation, durable acceptance, and only then Android clipboard application.
- [ ] Continue to apply a new live Remote Clip automatically while the WebView and Capacitor bridge remain healthy, accepting Android's system-controlled clipboard preview.
- [ ] Persist at most one Android pending-application marker after a live Remote Clip clipboard write fails; the marker identifies the existing Clip and does not create a new event.
- [ ] Replace an older pending marker when a newer eligible live Remote Clip cannot be applied, so recovery never replays a stale sequence of clipboard values.
- [ ] Retry the newest pending live Remote Clip at most once when the Activity resumes, and only while it remains retained, unsuppressed, learned through the live path, and Auto Sync is enabled.
- [ ] Clear the pending marker after successful application, one failed retry, ineligibility, local Clip removal, history clearing, Identity Rotation, or replacement by a newer eligible live Remote Clip.
- [ ] Never create pending application work from Clipboard History Reconciliation and never apply an imported historical Clip to the system clipboard.
- [ ] Preserve Pairing, Device Membership, Device Revocation, immediate-sender authentication, and Active Member authorization without adding authority to Android intent payloads.
- [ ] Add deterministic coverage for selected-text and Sharesheet discovery, cold and warm ingress, process restart before drain, identical repeated actions, partial persistence failure, exactly-once completion, and disabled Auto Sync Share Now behavior.
- [ ] Add deterministic coverage for successful background application, initial write failure, newer-live replacement, one resume retry, second failure clearing, Auto Sync cancellation, local deletion, history clearing, Identity Rotation, and historical-import exclusion.
- [ ] Keep shared runtime conformance, Clip synchronization, Clipboard History Reconciliation, lint, and Android build checks green.
