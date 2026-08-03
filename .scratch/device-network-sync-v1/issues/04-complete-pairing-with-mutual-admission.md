# 04 — Complete Pairing with mutual Admission

**What to build:** Complete the user's Pairing decision so acceptance creates durable mutual Device Membership, rejection changes no membership, and asymmetric delivery failures remain safely repairable.

**Blocked by:** 03 — Open Pairing with a durable Trust Request.

**Status:** ready-for-agent

- [ ] Acceptance and rejection occur only inside Clipp and revalidate the original request, current time, authenticated identities, and current Revoked Peer ID sets at decision time.
- [ ] A Trust Response uses an independent one-frame `/clipp/pairing/1.0.0` stream and contains a nonzero decision, the exact original request envelope bytes, and the responder's own presentation metadata.
- [ ] Target-side acceptance atomically verifies remove-wins state and persists Admission before its one best-effort accepted-response delivery attempt.
- [ ] Response delivery failure does not roll back target-side Admission and creates no durable outgoing response job.
- [ ] Initiator-side acceptance verifies the original request signature and identities, rechecks expiration and remove-wins state, and atomically persists the target's Admission.
- [ ] A non-conflict initiator persistence failure exposes no partial membership change and runs one visible capped-backoff in-memory retry loop per target using freshly signed requests.
- [ ] Retry stops on successful Admission, target revocation, or runtime shutdown; runtime restart clears the retry loop and requires user initiation.
- [ ] Explicit rejection sends one best-effort rejected response, clears the target's pending decision and notification, and never removes or changes existing Device Membership.
- [ ] Acceptance, rejection, expiry, and runtime shutdown clear the applicable waiting state without treating local state deletion as cancellation of an already delivered signed request.
- [ ] A valid request from an already Active Member is accepted automatically, allowing a lost response and temporary asymmetric Membership Views to be repaired without another prompt.
- [ ] Pairing interoperability and failure cases pass through Electron, Android, and Chrome runtime adapters.
