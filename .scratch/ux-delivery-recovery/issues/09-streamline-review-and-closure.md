# 09: Make review and ticket closure advance the work

**What to build:** Give coordinators and reviewers an executable working procedure that resolves completed scopes promptly, keeps independent work moving and prevents optional feedback from becoming new acceptance gates.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Assignee:** `/root/closure`

**Claim:** ux-delivery-recovery-20261028-09; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [x] Update maintained repository workflow/reviewer guidance, keeping agent entry points concise and globally installed skills unchanged.
- [x] Consolidate Standards and Spec findings for a candidate and distinguish blocking correctness, accepted-contract and documented-standard violations from optional cleanup. Optional duplication or wording advice cannot block closure without an applicable rule or concrete defect.
- [x] Scope follow-up reviews to fixes and affected behavior, reopening settled areas only for a concrete impact. Preserve required final integration review and allow new actionable defects to be reported with evidence.
- [x] Preserve npm check before code commits, hooks, routine verification and required native gates. Batch related fixes into reviewable changes; avoid extra full-suite reruns on unchanged inputs solely for another receipt.
- [x] Route mechanical requirements to suitable existing executable checks and reserve reviewer prose for judgment. Do not add tests that merely match instruction wording.
- [x] Enforce the at-most-two-implementer procedure and serialize only conflicting native resources. A blocked claim retains its owner but can release active source capacity while independent eligible work proceeds.
- [x] Dispatch scoped context pointers and use completion/state-change waits instead of repeated unchanged polling or messages. Carry applicable user authorization through handoffs without broadening it or asking again for already-authorized scope.
- [x] After an evidence batch, the coordinator resolves satisfied scopes, records residual scenarios, releases capacity and advances the frontier. A partial-check report does not end authorized eligible work; actual missing prerequisites or decisions are reported precisely.
- [x] Demonstrate the procedure in a coordinator walkthrough with one complete scope, one blocked native scope and one independent eligible scope. Show optional feedback remaining nonblocking, required defects withholding closure, preserved permissions and prompt next-action selection.

**Scope boundary:** This is a workflow behavior slice that can be verified using existing tracker/status examples. It does not depend on the new compact report, weaken required checks, introduce a scheduler or close live UX tickets during its walkthrough.

## Answer

Delivered [maintained review and closure guidance](../../../docs/agents/review-and-closure.md), the agent-guide entry pointer, and a [coordinator walkthrough](../proposals/ticket-09/coordinator-walkthrough.md). The walkthrough preserves required defects/native gates and authorization limits while demonstrating prompt closure and independent dispatch. No live UX claim changed.

Source and first integrated revision: `b786abcc39c834e9278e0df45d9559a9a0ec3243`, from baseline `774a5f52adb8c893ad028790d3dcc59fd070d2bd`. Merger verified clean containment and exact three-file scope. Prettier, ten relative links and whitespace checks passed. Standards and Spec review at `ca76951945185cac7bb161ae12aa8544e438146b` found no ticket 09 defects; its files are unchanged at that reviewed revision. Documentation-only checks do not claim native acceptance. Coordinator `/root` resolves this independent scope on 2026-10-28. The later main-integrated workflow routing reconciliation remains an adoption continuation, without reopening this delivered guidance. See [review record](../review.md) and [current run](../run.md).
