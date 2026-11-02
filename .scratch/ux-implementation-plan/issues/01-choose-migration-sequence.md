# Choose the correctness-first migration sequence

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session)
Parent: [Clipp UX implementation planning](../map.md)
Blocked by: none

## Question

Which independently reviewable migration steps implement the accepted priority order while avoiding duplicate work on the current and replacement interfaces?

Use the [handoff priority bands](../../ux-study/handoff.md#approved-priority-order) and [inspected seams](../source-context.md). Identify urgent repairs that can land on current surfaces and remain useful—such as field-scoped Chrome settings mutations, authoritative History updates and truthful action results—and the repairs best delivered once within the approved workspace. Define what a usable first correctness milestone contains and what remains explicitly later. Do not defer blocked controls, unreadable fields, Android safe bounds or accessibility merely because they involve styling.

Set the transition policy: small independently verifiable steps versus a larger combined workspace integration after urgent repairs. Define cross-runtime completeness for a changed shared action, what can coexist temporarily, and the evidence needed before retiring an old surface. Reusing options as full-page Clipp is available; exact routing and state contracts belong to the next decision. Preserve the agreed priority order and its allowance for small related lower-band work alongside its owning component.

Resolution should give a migration strategy, first milestone boundary, transition invariants and rationale sufficient to constrain the remaining planning tickets. It does not authorize implementation, commits or release work.

## Comments

2026-10-10 charting: asked the user whether to use small independently verifiable steps (recommended) or one combined workspace integration after urgent fixes. Recommendation: urgent corrections first, then flow-by-flow adoption, with every affected bridge updated alongside shared behavior. The answer was pending at charting; the subsequent user decision is recorded below. No planning ticket was resolved in the charting invocation.

### Approved sequencing preference

2026-10-10: the user selected **“Small, independently verifiable steps (Recommended).”** Plan urgent correctness fixes first, then adopt the approved workspace flow by flow. Each changed shared behavior includes its affected runtime bridges and meaningful validation in the same scoped step. Preserve correctness → compact workspace → additions and the existing allowance for small related work alongside its owning component.

The small-step strategy is settled; do not ask that choice again. At this stage the ticket remained open for its substantive planning work: identify the first correctness milestone, reusable versus replacement-bound repairs, temporary coexistence, and cutover/completeness criteria. That answer alone did not settle those boundaries, authorize implementation or resolve the entire ticket.

### Migration milestone definition

Claimed 2026-10-10 at the user's explicit request to proceed with this ticket and define the first correctness milestone. Prepare a concrete boundary and acceptance proposal using the existing evidence and source seams. Preserve the approved small-step strategy; no application changes or native checks are part of this planning round.

The [first correctness milestone proposal](../first-correctness-milestone.md) defines **Reliable state and recoverable actions on existing surfaces**, beginning with **Chrome preference integrity**. It specifies reusable slices, partial finding coverage, minimal usable feedback, coexistence/cutover rules and candidate-bound exit checks. Read-only source review identified partial-save boundaries in settings/approval, non-addition History invalidation, terminal Pairing outcome limits and the valid oversized-QR text fallback; the proposal preserves those distinctions.

The recommendation presented was a focused first checkpoint followed immediately by the remaining first-band access/native/task work, before completing the compact workspace. This does not change the approved priority bands or imply all correctness work is finished. The alternative was a larger all-first-band checkpoint. The ticket stayed claimed pending this concrete scope decision; the already approved small-step preference was not re-asked.

## Answer

Resolved 2026-10-10 after the user selected **“Focused state/action milestone (Recommended)”** in response to the concrete milestone proposal. This completes the migration decision alongside the previously approved small, independently verifiable steps.

Adopt [First correctness milestone and migration sequence](../first-correctness-milestone.md) as the approved planning boundary:

- **First milestone:** Reliable state and recoverable actions on existing surfaces. Begin with **Chrome preference integrity**, then deliver current History/Clear, recoverable existing edits and immediate Pairing/approval results, and truthful QR generation/Copy in independently verifiable slices. These durable corrections should carry into the replacement workspace.
- **Priority:** this checkpoint covers the explicitly allocated finding portions, not all correctness work. Remaining accessibility, native, shared-task and recovery repairs follow immediately within the correctness phase, before completing the compact workspace; additions follow the agreed bands. Independent urgent repairs and small related work may proceed alongside their owner.
- **Transition:** retain usable current surfaces until their replacements meet functional parity, live state, truthful errors, session-draft, focus and stale-target criteria. Temporary layout coexistence is acceptable; conflicting authoritative state or permission semantics is not. Every changed shared behavior includes all affected bridges and consumers in its slice.
- **Evidence:** preserve the proposal's partial-effect, stale-response and QR-fallback distinctions. Require meaningful regressions and current-candidate surface checks for the actual changes; mark only verified finding portions complete. The accepted native gaps remain unverified with their future owners.

The focused scope yields an earlier meaningful checkpoint without making current-state repairs depend on the full workspace/native integration. Exact state/action/task interfaces, implementation ticket boundaries and validation ownership remain with the following planning decisions. No application implementation, new native checks, commits or release qualification occurred or are authorized by this resolution.

No newly discovered decision requires a new ticket. The next frontier is **Define shared state, actions and task boundaries**; it remains open and unclaimed.
