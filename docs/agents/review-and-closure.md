# Review and close scoped work

Use this procedure when reviewing a candidate, reviewing fixes, receiving an evidence batch or choosing the next assignment. Start with the selected feature's canonical tracker, specification, current run record and [local issue conventions](issue-tracker.md). The numbered ticket files own status and dependencies; only the coordinator changes claims, blockers and resolution. This document adds review decisions to that lifecycle, rather than another status store.

## Establish the review boundary

1. Record the ticket/claim, owner, repository roles, source baseline and full source/integration hashes. Inspect current Git before trusting recorded tips. Name the candidate, requirement/scenario allocation, applicable authorization references and evidence locations. Missing or changed inputs require an explicit impact assessment.
2. Review Standards and Spec against the same candidate. Standards covers applicable repository rules; Spec compares observable behavior with the accepted requirements and ADRs. Consolidate both into one finding list, merging duplicate observations while retaining their sources.
3. Give each finding its location, evidence, affected behavior, applicable requirement/rule and disposition. Finish when every finding has a disposition and every required scenario has an attributable result, remaining owner or precise blocker.

| Disposition                      | Closure consequence                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required correction              | A concrete correctness defect, accepted-contract violation or documented-standard violation withholds closure of the affected scope. Identify the rule or reproducible defect and expected correction. |
| Optional cleanup                 | Duplication, naming or wording advice without an applicable violated rule or concrete defect stays advisory. Record it separately; it creates no acceptance gate.                                      |
| Missing evidence or prerequisite | Name what is unavailable, its owner, affected scope and next action. A compilation, fixture or readiness pass cannot replace a required native observation.                                            |

A reviewer can report a new actionable defect during any review, including fix review. Supply evidence and its impact; the existence of new feedback alone does not reopen settled work.

## Review fixes and verification

Batch related required corrections into reviewable changes. Review the fix diff against the previously reviewed revision and exercise its affected behavior. Reopen a settled area only when a concrete dependency, regression or changed requirement affects it; record that impact. Preserve the required final integration review after the whole specification is assembled, in addition to scoped ticket reviews.

Use the repository's current [npm scripts](../../package.json), [pre-commit hook](../../.husky/pre-commit) and selected runtime acceptance instructions. Run `npm run check` before code commits, retain hooks and applicable routine verification, and complete every required native gate. Follow existing supported-runtime and candidate-isolation requirements. A documentation check establishes documentation quality only.

Renew checks when fixes, failed results, a final integrated candidate or changed applicability require them. On unchanged inputs, reuse attributable evidence with its original observed revision and explicit applicability assessment rather than rerunning a full suite solely for another receipt. Unknown impact remains unknown until reviewed or rerun; a fresh timestamp cannot repair missing evidence. When the main branch lacks maintained applicability tooling, record the assessment explicitly and retain conservative existing gates.

Route mechanical questions to existing suitable executable boundaries: formatting to Prettier, code correctness checks to npm scripts, Git ancestry/scope to Git, and metadata/graph checks to the maintained status command when available. Inspect command availability first. Reviewer judgment owns behavioral adequacy, requirement interpretation and evidence applicability. Instruction wording is not a test seam; add no prose-matching tests or replacement status engine.

## Close the batch and select work

After each evidence batch, the coordinator performs these steps before ending the continuation:

1. Compare the integrated result and current Git with the accepted scope, consolidated findings, required checks and scenario allocation. Confirm full hashes, review coverage and preserved artifact references. A source commit alone proves neither integration nor acceptance.
2. Resolve each satisfied scoped ticket promptly through the canonical tracker. Record its implemented output, integration, review and verification evidence. Residual qualification can belong to a separate ticket only through an approved, fully allocated refinement that preserves all criteria and hard dependencies. Otherwise the original ticket remains unresolved.
3. Record remaining scenarios with result/applicability, owner, prerequisite and next action. Keep a blocked claim's owner and reason. Release its active source-implementation capacity when it cannot proceed, without releasing its claim or pretending its native gate passed.
4. Derive the next frontier from canonical status and dependencies. Keep at most two active implementation agents across the run. Continue independent eligible work while native claims are blocked; serialize only conflicts on the selected desktop, clipboard, device or other native resource. Resource release does not grant native access or waive runtime gates.
5. Dispatch the selected bounded deliverable with pointers to its ticket/specification, current candidate/snapshot and relevant predecessor evidence; include role/root mappings, baseline/integration hashes, validation seams, owner and limits. Transfer the exact scope and source of existing user authorization. Reuse matching authorization without asking again; a missing or broader permission requires the specific additional decision before the dependent action.
6. Wait for completion or a meaningful state change using available coordination tools and their event/cursor waits. Choose a meaningful wait interval rather than repeatedly polling unchanged state or resending instructions. Use the interval for independent work when possible. At each completion/state change, return to step 1.

A partial-check report does not end authorized eligible work. Stop when the authorized objective is complete, the user requests a pause, or every remaining action requires a named unavailable prerequisite or user decision. Report each blocker, its owner and the exact next action needed to resume.

## Lineage and continuation

Each specification owns its own integration branch/worktree created from an explicitly resolved repository `main` hash. Ticket worktrees start from that specification's current integration tip; inspect and incorporate its latest tip before handoff, preserving dirty work. Record full baseline and resulting hashes per repository. Only that specification's reviewed tickets merge back to its integration branch. A dependency on another specification's unmerged work remains blocked until it reaches `main`; then update from `main` and renew affected verification. An alternative base requires an explicit user instruction.

On this slice's starting main baseline, `docs/agents/workflow.md`, the status CLI and the verification runner are not yet integrated. Use the existing tracker, Git and available npm/acceptance commands. Once the prerequisite workflow reaches `main`, reconcile its review/handoff/resolution routing with this document, route its relevant entry point here and verify their rules agree. Do not copy the unrelated branch or replace its coordinator lifecycle. Keep installed global skills unchanged.

The [coordinator walkthrough](../../.scratch/ux-delivery-recovery/proposals/ticket-09/coordinator-walkthrough.md) demonstrates these decisions with synthetic scopes; it changes no live UX claims or acceptance results.
