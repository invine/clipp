# 03: Devices view

**What to build:** Give users the approved Devices view of their Device Network, with existing management and Pairing journeys reachable and actual state shown honestly.

**Blocked by:** 01 — Responsive workspace and Clipboard History.

**Status:** ready-for-agent

- [ ] This device and Trusted Devices are distinguishable, with connection and last-seen information shown only when known; an offline Trusted Device is not presented as revoked.
- [ ] Existing Pairing entry, pending requests and outcomes, device details, naming, revocation and recovery flows remain reachable and retain their established behavior.
- [ ] Loading, empty, unknown, offline and failure states reflect authoritative runtime state, with accessible controls and usable narrow and wide layouts in both themes.
- [ ] Test user-visible shared UI and affected application UI with controlled device-state fixtures; do not run connection tests or tests that send Clips.
- [ ] Preserve Device Membership, Trust, Device Revocation and Pairing semantics and do not introduce transport or relay changes.
