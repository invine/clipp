# 03: Devices view

**What to build:** Give users the approved Devices view of their Device Network, with existing management and Pairing journeys reachable and actual state shown honestly.

**Blocked by:** 01 — Responsive workspace and Clipboard History.

**Status:** resolved
Assignee: workspace-03
Claim: clipp-approved-workspace-03
Branch: `codex/clipp-workspace-03-devices`
Baseline: `c22eb460`

- [x] This device and Trusted Devices are distinguishable, with connection and last-seen information shown only when known; an offline Trusted Device is not presented as revoked.
- [x] Existing Pairing entry, pending requests and outcomes, device details, naming, revocation and recovery flows remain reachable and retain their established behavior.
- [x] Loading, empty, unknown, offline and failure states reflect authoritative runtime state, with accessible controls and usable narrow and wide layouts in both themes.
- [x] Test user-visible shared UI with controlled device-state fixtures; do not run connection tests or tests that send Clips.
- [x] Preserve Device Membership, Trust, Device Revocation and Pairing semantics and do not introduce transport or relay changes.

## Comments

Implemented on top of the integrated workspace revision `e7cc568`. The Devices view now distinguishes This device from Trusted Devices, labels each membership separately from its known live connection (`Trusted · Connected · direct`, `Trusted · Offline`, or the existing unknown/path status), and omits last-seen text because the Device model has no timestamp. Existing Pairing, Requests, rename, revoke and recovery handlers remain in place. A dedicated viewport rule ensures the active destination hides Clipboard History.

Focused validation: `npm test -- --runInBand tests/ui/workspaceNavigation.test.ts tests/ui/clipDetails.test.ts` passed 2 suites / 29 tests; `npm run typecheck:shared` and `git diff --check` passed. Fixture-only visual captures were reviewed at `/private/tmp/clipp-devices-view/desktop-dark.png` and `/private/tmp/clipp-devices-view/phone-light.png`. No runtime action, Pairing action, connection test, or Clip-send test was run. Runtime-specific cross-application qualification remains assigned to ticket 05. Full `npm run check` was not run; ticket 01 documents the unrelated Android TypeScript baseline failures that block it.
