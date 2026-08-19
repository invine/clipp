# Device Network Sync v1

## Notes

- The delivery boundary and settled requirements are recorded in [the specification](spec.md).

## Decisions-so-far

- [09 — Recover captures after storage failure](issues/09-recover-captures-after-storage-failure.md): Keep temporarily failed Local Clips in a bounded in-memory queue with their original identity. On recovery, store every recoverable Clip, but allow only the newest still-current and eligible Clip to re-enter the live path; an exact duplicate is eligible when the original storage call committed before reporting failure.

## Fog

- None recorded.
