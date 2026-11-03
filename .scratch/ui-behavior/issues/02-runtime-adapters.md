# Production runtime adapters

Status: claimed
Blocked by: none

Specification: [spec](../spec.md), requirements R3, R4, R8. Decisions D1–D3.

Implement production adapters and slim runtime views for Electron, Android, extension. Coordinate shared contract with 01 before wiring. Own apps/electron, apps/android, apps/extension and adapter tests; do not edit shared UI files concurrently. Preserve bridge behavior and state authority.

## Verification

TDD at the user-approved UI/effect seam, relevant regressions, full npm run check before code commits. Integrated npm run verify and Standards/Spec review before resolution.

## Comments

Claim: /root coordinator assigns /root/runtime_adapters on 2026-11-03. Baseline main cbfa8887c9f54778c9820f41f4c83460d33b0173; specification decisions D1–D3 preserve accepted invariants.
