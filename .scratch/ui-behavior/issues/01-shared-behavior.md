# Shared reducer behavior and adapter contract

Status: claimed
Blocked by: none

Specification: [spec](../spec.md), requirements R1, R2, R3. Decisions D1–D3.

Define the common adapter contract and deepen shared UI behavior with pure reducers and an effect runner. Migrate actual UI call sites; preserve regression semantics. Add seam tests incrementally. Own packages/ui and new packages/core runtime-consumption files; coordinate contract with ticket 02.

## Verification

TDD at the user-approved UI/effect seam, relevant regressions, full npm run check before code commits. Integrated npm run verify and Standards/Spec review before resolution.

## Comments

Claim: /root coordinator assigns /root/shared_behavior on 2026-11-03. Baseline main cbfa8887c9f54778c9820f41f4c83460d33b0173; specification decisions D1–D3 preserve accepted invariants.
