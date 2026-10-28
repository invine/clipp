# UX delivery recovery review

Baseline: `479e05caef8318043b3381bec8af720abe2d8ae9`. Reviewed candidate: `ca76951945185cac7bb161ae12aa8544e438146b`. This is a review of the assembled independent slices, not a final acceptance claim for the blocked specification.

## Standards

Reviewer: `/root/review_standards`. Read-only review of `git diff 479e05caef8318043b3381bec8af720abe2d8ae9...ca76951945185cac7bb161ae12aa8544e438146b`; candidate `ca76951945185cac7bb161ae12aa8544e438146b`.

**Documented-standard breaches: none found in the reviewed diff.** The sources were the user-provided AGENTS instructions, integration AGENTS.md and docs/agent-guide.md, new docs/agents/review-and-closure.md, and primary docs/agents/{operations,workflow,verification,issue-tracker}.md. No product transport, identity, runtime bridge, shared UI or protocol implementation changed; accepted ADR boundaries remain intact.

The candidate preparation uses npm and the documented Node floor, selects committed source in a separate clone, preserves dirty source, and extends the existing check command. The review guidance preserves coordinator-only resolution, main-first lineage, explicit prerequisite blockers, required native gates and advisory treatment of optional cleanup. The graph output remains a proposal; existing native claims are neither activated nor resolved.

**Baseline smell judgments:** no material actionable smell identified after checking all twelve supplied heuristics. Small validation helpers and the single-purpose preparation script do not justify additional abstraction or splitting merely for size. No optional cleanup gate is proposed.

**Evidence limits:** This is a source-standards review, not a renewed npm check, runtime qualification or closure decision. Tool-enforced formatting/lint/type concerns were excluded. The already identified tracked build symlink/ENOENT preparation blocker remains an existing required correction; this report does not duplicate it as a new finding or certify the candidate usable. Any fix requires review of its diff and affected verification against its exact successor revision.

Counts: 0 new documented-standard breaches; 0 optional smell findings. Existing preparation blocker remains unresolved for the coordinator to disposition.

## Spec

Compared `479e05caef8318043b3381bec8af720abe2d8ae9...ca76951945185cac7bb161ae12aa8544e438146b`; approved recovery specification and tickets 01/02/09.

## Delivered-slice findings

1. **Required correction: frozen candidate verification does not bind installed runtime content.** `scripts/prepare-acceptance-candidate.mjs:119–130,167–181` checks dependency links, Electron package version and npm's hidden lockfile, but hashes only application `dist` files. Replacing/deleting installed Electron executable bytes or an external runtime dependency leaves these checks unchanged. Spec §3 requires: “Freeze the built artifact for the acceptance batch” and records “runtime artifact” among relevant inputs; ticket 02 requires a “usable frozen build” and tests for “candidate mutation.” A public-command reproduction appended to the existing disposable fixture creates changed ignored `packages/electron/dist/electron` runtime content after preparation; `verify` still succeeds (`/private/tmp/clipp-spec-candidate-mutation.test.mjs`, one passing reproduction). Bind the bounded selected runtime's execution inputs; no universal dependency audit is needed. Host loading/ABI observations remain with 05–07.

2. **Required correction, already known/in progress: real repository cannot prepare.** `tracked()` at `scripts/prepare-acceptance-candidate.mjs:68–77` applies `file()`'s regular-file requirement to every tracked entry. Candidate `build` is a tracked symlink to `node_modules/node-datachannel/build`, so preparation fails before npm installation. Ticket 02 explicitly requires: “A successful preparation produces a usable frozen build for the selected runtime.” The reported actual preparation failure confirms this delivered-slice gap; generic fixtures omit this repository condition. Preserve link provenance without accepting cross-checkout execution inputs.

## Missing/partial requirements and scope

Ticket 01's public CLI graph/ownership checks remain unresolved behind the absent main-integrated agent-workflow prerequisite. Evidence applicability, readiness/retry adoption, compact recovery and full recovery-to-scenario demonstration remain external-prerequisite-blocked work, not defects falsely claimed complete here. Absent npm verify and inherited lint failure remain explicit verification limitations.

No concrete unrequested behavior or wrong ownership allocation was found in proposed ticket 01; it changes no live frontier. Ticket 09 guidance/walkthrough preserves required gates, ownership, permission scope and final integration review. Its synthetic walkthrough is labeled accurately.

## Disposition

Standards: zero new findings. Spec: two required corrections in ticket 02; both assigned to the single existing implementer `/root/candidate`. The tracked-source-link fix is prepared; runtime-artifact mutation binding is in progress. No ticket 01/09 correctness finding was raised. Optional feedback creates no additional gate. Successor review will cover the fix diff and affected behavior.

Ticket 09 is independently integrated, reviewed and resolved. Ticket 01 stays owned and unresolved for unavailable public CLI/real-Git validation. Ticket 02 stays owned and unresolved until its corrected real candidate and affected review pass. Remaining tickets keep their canonical dependencies and external prerequisites; none has a native pass from this review.

## Successor verification and closure

Affected fix reviews at `c722cd4bd761e5e9815e937d77c6ea1b08a65750` corrected both Spec findings; Standards/Spec reported no new blocking findings. Setup follow-up at `127ad92b92cfc9332f7fe9749bd70b5aac660dff` added the installed Electron package’s explicit installer after the real build exposed Electron43’s missing-postinstall behavior. Both axes again found no blocking findings; focused setup fixtures passed. Reports `review-{standards,spec}-{c722cd4,127ad92}.md` remain in durable primary-root evidence.

The real frozen candidate at127ad92 passed provisioning/build/verify and exact-candidate full checks. Original failed observations remain intact. Ticket02 is resolved by the coordinator on its scoped requirements; ticket01 and all unavailable native/adoption requirements remain unresolved. Final reporting edits change only result/status navigation, not candidate source, build inputs, runner, scenario definition or required acceptance meaning; no result is relabeled as a new run. Git containment and unchanged execution inputs remain separate from historical observations. This does not claim the unavailable applicability CLI passed.

Standards: zero blocking/optional findings. Spec: two required findings corrected, zero outstanding delivered-slice findings. Full-spec completion is withheld for named main-first prerequisites and unrun adoption/native gates.
