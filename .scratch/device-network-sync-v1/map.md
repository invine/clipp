# Device Network Sync v1

## Notes

- The delivery boundary and settled requirements are recorded in [the specification](spec.md).

## Decisions-so-far

- [09 — Recover captures after storage failure](issues/09-recover-captures-after-storage-failure.md): Keep temporarily failed Local Clips in a bounded in-memory queue with their original identity. On recovery, store every recoverable Clip, but allow only the newest still-current and eligible Clip to re-enter the live path; an exact duplicate is eligible when the original storage call committed before reporting failure.
- [13 — Reuse and explicitly share Clips](issues/13-reuse-and-share-clips.md): Retained-Clip reuse writes the platform clipboard before creating a new serialized Local Clip; Share Now creates one distinct Local Clip whose in-memory override can attempt initial live delivery without changing Auto Sync.
- [14 — Revoke Device Membership network-wide](issues/14-revoke-device-membership.md): Persist a remove-wins tombstone before publication or enforcement, propagate the complete durable Membership View, and give a connected revoked identity one final view before closing and forgetting it.
- [15 — Rotate revoked Device Identities safely](issues/15-rotate-revoked-identities.md): Keep revocation recovery local-only and offline, reuse one staged replacement identity across retries, and activate its clean singleton state only after identity-scoped cleanup succeeds.

## Fog

- None recorded.
