# Reliable completion of UX implementation

Status: ready-for-agent
Approval: specification and testing boundaries approved by the user on 2026-10-28
Date: 2026-10-28
Owner: client (Clipp)
Scope: all six improvements from the UX implementation retrospective
Execution: specification only; existing implementation claims and acceptance results are unchanged

## Problem Statement

The Clipp UX implementation repeatedly reaches working source and passing automated checks without reaching ticket completion. Native acceptance grows additional preparation, review, dependency-audit and cleanup-proof requirements. Agents spend extended sessions validating those prerequisites while the actual user journey remains untested. Shared host failures and unavailable environments repeatedly consume implementation capacity.

The candidate also changes during preparation. Shared workspace dependencies can resolve another checkout, native dependencies can be missing despite passing compilation, and a successful check can cover a clean subset that excludes current runtime changes. Dependency edges sometimes require final native journeys before the normal UI needed to exercise them is implemented. Repeated reviews, stale execution summaries and fragmented authorization records make each continuation reconstruct the same state.

The user needs finite, trustworthy acceptance and predictable progress across Electron, the Chrome toolbar popup and full-page management, and Android. They should not need to repeatedly request continuation, rediscover testing permissions, or waive unfinished gates merely to unlock unrelated work.

## Solution

Refine the existing delivery workflow and tooling around one committed acceptance candidate, a finite scenario checklist, maintained runtime preflights, and a compact current-state report. Separate independently usable implementation outputs from residual native qualification without weakening either. Keep evidence bound to what was actually tested and carry it forward only when its relevant inputs and requirements remain unchanged.

Build on the operational-reliability work already implemented. Incorporate its corrected native readiness and durable diagnostic limits through the established integration process. Replace local exhaustive preparation gates with bounded checks of the actual runtime and scenario. Retain real native acceptance, isolation, ownership checks, applicable user authorization, and truthful failure reporting.

The result is demonstrated by a fresh coordinator recovering the active effort, identifying the next eligible action, preparing the intended candidate, running a bounded acceptance scenario, and recording or closing the appropriate scope without reconstructing historical conversations.

## User Stories

1. As a user, I want every remaining acceptance gate listed before execution, so that completion has a stable, visible meaning.
2. As a user, I want progress reported as completed outputs and remaining scenarios, so that large test counts do not conceal unfinished work.
3. As an implementer, I want a finite runtime preflight, so that I can reach the feature under test without proving every possible dependency path.
4. As a native tester, I want the actual application entry and required native addons exercised, so that compilation success cannot hide an unusable runtime.
5. As a maintainer, I want reproducible dependencies and workspace resolution, so that tests execute the intended source checkout.
6. As a coordinator, I want one committed candidate for an acceptance batch, so that its results apply to a coherent implementation.
7. As a reviewer, I want build and installed-artifact identity recorded, so that a stale application cannot qualify current source.
8. As a coordinator, I want unrelated dirty work preserved and explicitly excluded, so that candidate preparation neither loses work nor makes misleading claims.
9. As a coordinator, I want unaffected evidence carried forward with a checked applicability record, so that documentation edits do not force a full native rerun.
10. As a reviewer, I want relevant code, dependency, toolchain, fixture or requirement changes to invalidate affected evidence, so that reuse remains trustworthy.
11. As a resuming agent, I want missing applicability information reported as unknown, so that absence of metadata cannot become an automatic pass.
12. As an implementer, I want dependencies to name the usable outputs I need, so that an unrelated runtime qualification does not block implementation.
13. As a reset implementer, I want the integrated reset UI available behind runtime availability controls before final end-to-end qualification, so that testing uses the real path.
14. As a reviewer, I want every original qualification preserved under a named owner when tickets are split, so that a graph refinement cannot silently waive coverage.
15. As a user, I want prior scoped acceptance decisions preserved accurately, so that waived checks remain distinguishable from observed passes.
16. As a tester, I want a harmless interaction to demonstrate readiness, so that a connected debugger or readable DOM is not mistaken for a usable test environment.
17. As a Chrome tester, I want toolbar-popup and ordinary-tab evidence distinguished, so that popup lifecycle claims come from the actual popup.
18. As an Android tester, I want the selected device, installed candidate, WebView and target instrumentation verified, so that checks cannot silently target another installation.
19. As an Electron tester, I want the owned window and input path verified, so that inaccessible or stale native state is diagnosed before a matrix starts.
20. As a tester, I want prerequisite, runner, product and unknown failures separated, so that the next action addresses the actual failure.
21. As a coordinator, I want retries to require a changed hypothesis and expected observation, so that retries produce information.
22. As a user, I want the accepted five-attempt and twenty-minute diagnostic limits preserved across continuations, so that a new chat or directory cannot restart an exhausted loop.
23. As a tester, I want owned cleanup to be deterministic and its limits explicit, so that failed cleanup neither damages another process nor becomes an impossible historical proof exercise.
24. As an authorizing user, I want applicable permissions retained with their scope, so that I am only asked for genuinely missing authorization or participation.
25. As a coordinator, I want shared desktop, clipboard and device work serialized while independent implementation proceeds, so that scarce native resources do not serialize the whole effort.
26. As an implementer, I want consolidated blocking review findings, so that optional style suggestions do not generate repeated full review cycles.
27. As a reviewer, I want follow-up review to cover the fixes and their affected behavior, so that unrelated settled code is not repeatedly reopened.
28. As a maintainer, I want mechanical requirements checked by executable tooling, so that agents do not repeatedly debate hashes, references or workspace paths.
29. As a coordinator, I want completed scopes resolved promptly, so that an already-passing ticket does not continue blocking its consumers.
30. As a user, I want authorized work to continue after a partial check, so that I do not have to repeatedly say “continue.”
31. As a resuming agent, I want one authoritative effort entry point, so that stale copies cannot govern current execution.
32. As a resuming agent, I want a compact report of candidate, claims, remaining scenarios, blockers and next actions, so that historical receipts remain reference material.
33. As a maintainer, I want old ledgers and receipts preserved and readable, so that workflow migration does not rewrite previous observations.
34. As a coordinator, I want evidence retained outside disposable worktrees, so that retiring a completed worktree cannot destroy the handoff.
35. As a maintainer, I want existing operational-reliability improvements reused, so that this effort does not create another overlapping acceptance framework.
36. As a reviewer, I want a demonstrated recovery-to-acceptance workflow, so that completion means the delivery process works in practice rather than only in mocked tests.

## Implementation Decisions

### 1. Finite acceptance and bounded preparation

- For each affected ticket, enumerate its required scenarios before execution. Each scenario records the requirement source, consuming output, runtime/surface, prerequisites, expected observation, evidence type and owner. Preserve existing Candidate, External and Retained dispositions. A readiness check, routine verification pass and native journey remain different results.
- A new failure may justify a regression scenario. Record the concrete defect or changed requirement that adds it; incidental preparation discoveries do not silently enlarge the product acceptance matrix.
- Replace the Pairing harness's exhaustive dependency-graph SEAL prerequisite with a maintained preflight for the selected scenario. It verifies candidate/build identity, dependency installation, required native-module loading through the owning runtime, actual application startup, and the capabilities and route needed by that journey. Missing modules required for the exercised path fail preflight. Optional, tooling-only or unselected paths do not require universal proof before the selected scenario can execute.
- Keep normal dependency provenance and lockfile integrity checks. Fix installation problems at the reproducible setup boundary rather than manually patching successive runtime copies. A smoke test exercises actual product startup in a disposable profile with network and clipboard behavior controlled for the declared scenario; a standalone SQLite query is insufficient.
- Retain historical SEAL attempts and failed receipts as historical evidence. The replacement is an explicit acceptance-tooling change, not a declaration that an old SEAL succeeded. Migrate current callers and instructions together so obsolete local gates cannot continue blocking the new path.
- Extend maintained acceptance commands with small scenario adapters where necessary. Do not introduce another generic harness, recursive review-attestation protocol, or complete dependency-graph certification system. Validate mechanical inputs at the command boundary once, with attributable runtime observations afterward.

### 2. Dependency graph and qualification ownership

- Preserve numbered ticket files as the authority for Status, Assignee and Blocked by. Separate a scoped implemented/integrated/verified deliverable from a residual qualification by using the UX spec's existing numbered-ticket refinement mechanism; do not create a competing status system or bypass unresolved hard dependencies.
- Audit the remaining UX graph, especially Settings, reset runtime, reset UI and final reset qualification. A consumer depends on the completed compatible output it uses. A final whole-journey qualification belongs after the real consumers needed to exercise it exist.
- Refine reset runtime acceptance to distinguish actual host-seam proof needed by its consumer from complete integrated UI/clipboard/restart journeys owned by final reset qualification. The reset UI remains unavailable for normal use on unqualified runtimes. Neither a split nor source integration enables the feature.
- For every refinement, map each original criterion and finding contribution to exactly one primary qualification owner, retaining contributor links where several outputs are needed. Update ticket dependencies, catalog, traceability and coverage together. Validate missing references, dependency cycles and unassigned criteria mechanically.
- Preserve genuine runtime requirements: signed-stateless Pairing, authoritative Admission and Device Membership, remove-wins Device Revocation, durable same-candidate reset recovery, required receipt, old-work fencing, preserved settings and normal clipboard baseline. This effort changes delivery sequencing, not these product contracts.
- Preserve previous explicit user acceptance or exclusions with their exact scope and source. Record administrative acceptance separately from measured pass. No prior exclusion automatically applies to a new consumer or an unrelated scenario.
- The new graph must demonstrate that the reset UI can be implemented behind availability controls once its scoped inputs are verified, and that final reset qualification still requires the integrated UI. Missing host qualification blocks only the output or activation that consumes it.

### 3. Reproducible candidates and evidence applicability

- Preserve existing working copies, uncommitted changes, branches and artifacts before reconciliation. Identify which changes belong to the acceptance candidate; commit intended source through normal review and checks. Preserve excluded work with an owner and location. A receipt may not describe an excluded dirty slice as current integrated acceptance.
- Use a dedicated, clean acceptance checkout and isolated dependency installation for each batch. Record source revision, lockfile, build configuration, supported Node/npm and runtime versions, built artifact identity and scenario/runner version. Validate that workspace package resolution stays inside the selected candidate. Avoid mutable dependency links to another worktree.
- Freeze the built artifact for the acceptance batch. Other implementation can proceed in separate ticket worktrees without changing that batch. A relevant fix produces a successor candidate and an explicit affected-scenario rerun list.
- Add deterministic setup checks for wrong-worktree resolution, required native-addon absence or ABI mismatch, and source/build/install mismatch. Keep native startup checks in the applicable runtime profile; routine Linux verification must not pretend to qualify macOS native behavior or Android instrumentation.
- Extend the existing ledger/status model with explicit evidence applicability. Preserve the original observed revision and result. A carry-forward record identifies the new candidate, scenario, relevant inputs, changes assessed, rationale and reviewer; it never changes the historical observation into a new execution.
- Relevant inputs include implementation and transitive workspace/dependency inputs, lockfile/toolchain/build settings, runtime artifact, runner or fault-injection behavior, acceptance requirement and environment dimensions material to the scenario. The manifest is bounded to the selected built runtime and test contract; it is not a universal dynamic-import audit. Unknown impact requires review or rerunning the affected scenario.
- Pure documentation or ticket-status changes with no changed acceptance contract or execution inputs may carry prior evidence. Documentation that changes required behavior, scenario scope or gate meaning cannot use a filename-only exemption. Code/build/runtime changes receive an impact assessment; the conservative fallback is the affected runtime/scenario suite.
- Update the existing unconditional current-tip freshness rule and recovery instructions together. Preserve historical ledger versions with their existing semantics until explicitly migrated. Current Git integration and ownership facts are still checked; applicable behavioral evidence does not excuse a missing integration or mismatched source mapping.
- Keep metadata integrity failures distinct from ordinary stale scenario evidence. Missing roots, conflicting ownership or an invalid graph may withhold dispatch; a known stale result on one ticket withholds that ticket's resolution and dependent work while unrelated consistent work can remain eligible. Status remains read-only and does not close tickets, execute recorded commands or grant authority.

### 4. Maintained readiness, diagnosis and resource ownership

- Reuse the corrected operational-reliability readiness commands, shared attempt history, classifications and authorization records. Inspect their current integration and outstanding amendment before implementation. Previously reported Android WebView/instrumentation defects have recorded repairs and native evidence; verify and reuse them rather than reimplementing the old findings.
- Preserve the newer accepted retry policy: one initial attempt plus at most four diagnostic attempts, with twenty minutes of troubleshooting after the initial failure. Initial setup/build and normal successful matrix execution are outside the diagnostic clock; diagnostic rebuilding is charged. Commands receive the remaining deadline, and cleanup retains its own bounded allowance and reported outcome.
- Key durable attempt history by effort and semantic scenario/environment identity. Changing a directory, candidate label or chat does not itself reset a failed scenario's budget. Each diagnostic retry records a changed hypothesis or environment and an expected distinguishing observation. Preserve exhausted histories; a renewed budget requires an explicit recorded decision under the existing policy.
- Readiness establishes the owned target and a harmless observable interaction before the larger matrix. Electron checks the actual usable window; Chrome checks the intended profile, extension and surface; Android checks the selected serial, candidate package, supported WebView diagnostics, target-package instrumentation and an observed control change. Do not substitute package presence or DOM readability for interaction.
- Distinguish runner, prerequisite, product and unknown failures in receipts. Missing GUI access, a locked desktop, denied loopback access or absent test counterpart becomes a specific blocker with an actionable recovery step. It does not trigger speculative product edits or repeated unchanged whole-suite runs.
- Preserve normal network policy and one-retained-Relay-Session fallback. Real Pairing and Clip exchange use permitted test routes. Readiness does not resume deferred account sign-in, weaken transport policy, or replace the required native journey with a protocol-peer fixture.
- Coordinate shared desktop focus, clipboard, display settings and selected devices using existing run ownership. Reuse applicable scoped user authorization; request availability or missing scope only when needed. A planning specification grants no new host clipboard, personal-profile, device or account permission.
- Prefer process handles and recorded owned groups/profile identities for deterministic cleanup. Guard against PID reuse before targeted termination. Normal exit and bounded cleanup of verified owned resources are supported; never signal unrelated or unidentified processes. Preserve uncertain cleanup as such, then use a bounded current ownership check to decide whether the next run is isolated. Historical absence of every possible detached descendant is not a prerequisite that can be established by repeated snapshots.
- Keep failed evidence and cleanup limits. A cleanup failure cannot disappear behind a successful product assertion, and no generalized user-profile cleanup is introduced.

### 5. Review, scheduling and prompt closure

- Use the existing coordinator and at-most-two-implementer workflow. A native-blocked claim retains its owner and reason without occupying an active source-implementation slot. Schedule independent eligible implementation while shared native resources are serialized.
- Dispatch bounded deliverables with pointers to the selected ticket, candidate and current snapshot. Avoid repeated full-history transfers. Wait for completion or a meaningful state change using the available coordination tools rather than repeated status polling and repeated messages with unchanged instructions.
- Consolidate Standards and Spec findings for a candidate. Mark blocking correctness, accepted-contract or documented-standard violations separately from optional cleanup. Optional duplication or phrasing suggestions do not block resolution unless they violate an applicable rule or cause a concrete defect. New actionable defects discovered during fix review remain reportable with evidence.
- Review follow-up fixes and their affected behavior against the recorded baseline; reopen unrelated settled code only for a concrete impact. Perform the required final integration review once the whole spec is assembled, without substituting it for scoped review during implementation.
- Keep npm check before code commits, existing hooks, routine verification and required native checks. Batch related fixes into reviewable commits. Avoid additional full-suite runs on unchanged inputs merely to produce another receipt; a fix, failed check, final integrated candidate or changed applicability justifies renewal.
- Mechanical requirements belong in existing executable checks. Reserve reviewer guidance for judgment about behavior, scope, cross-file consistency and evidence interpretation. Make repository-specific workflow changes in maintained project documentation; do not fork the installed global skills for this effort.
- After each completed evidence batch, the coordinator updates remaining scenarios, resolves any scope whose requirements are met, releases its active capacity and advances the frontier. Continue authorized eligible work after partial passes. End or pause execution when the task is complete, the user requests it, or all remaining actions require a named unavailable prerequisite or decision; report those blockers precisely.

### 6. Canonical navigation and compact recovery

- Maintain one canonical feature tracker and one explicit pointer from its ordinary entry point to the active integration checkout/branch and current run record. Keep local absolute roots in the existing local configuration. Mark archival planning copies clearly and remove stale live assertions that execution has not started.
- Extend the existing read-only status report to show the current candidate, authoritative claims, scoped implementation outputs, pending scenarios and their result/applicability, blockers, active capacity, applicable authorization references and next eligible actions. Derive ticket status and the frontier from canonical inputs rather than copying them into another mutable tracker.
- Keep one concise current run summary with links to relevant evidence. Archive superseded narrative without deleting failed receipts. A coordinator should need the entry point, current report and selected ticket to resume; historical investigation remains available on demand.
- Validate tracker/entry-point references, graph coverage, candidate consistency and required current metadata using existing status and source-lookup facilities. Bound file reads and output; do not recursively scan runtime profiles, all historical artifacts or private clipboard contents for routine recovery.
- Preserve receipts outside disposable worktrees. Retire worktrees created by this effort only after integration and evidence preservation are verified. Inventory pre-existing worktrees and leave their cleanup to their existing ownership or an explicit cleanup request.

### Delivery sequence and adoption

1. Reconcile the current operational-reliability and UX records, preserve dirty work, and publish the finite remaining-scenario allocation and proposed graph refinement. Reuse implemented readiness fixes and preserve the five-attempt amendment.
2. Implement the candidate/setup checks and evidence-applicability changes through existing public command boundaries. Update the contradictory freshness instructions and ledger compatibility together.
3. Adopt maintained readiness and bounded scenario adapters, replacing obsolete SEAL/receipt prerequisites for the selected UX scenarios. Candidate tooling and graph work can proceed independently where they do not share mutable files or resources.
4. Apply the reviewed UX ticket refinement, canonical pointers, compact status and coordinator/reviewer changes. This migration changes ownership and scheduling metadata; it does not mark unrun product gates passed.
5. Demonstrate the complete recovery-to-acceptance workflow and leave an executable continuation for every remaining UX scope. Finish this improvement effort without requiring the entire UX product backlog to be complete.

Each future spec integration checkout starts from its repository's selected main revision. Ticket worktrees start from that spec's integration tip. If required operational-reliability code is not yet on main, preserve the dependency and follow the existing main-first integration policy; do not silently stack unrelated spec branches or copy their dirty changes. Read-only comparison and planning can proceed meanwhile. Adoption in the active UX effort is coordinated with its current owner after the shared prerequisite is available.

## Testing Decisions

The user approved these testing boundaries on 2026-10-28: the public status CLI with temporary real Git repositories, maintained runtime acceptance commands, and existing npm verification plus focused actual-runtime demonstrations. Prefer those high-level seams over tests of receipt formatting or private helper calls.

1. **Status and graph behavior:** extend the existing real-Git CLI fixtures. Exercise source awaiting integration, completed scoped predecessor with residual host qualification, unknown/missing criterion owner, cycles, conflicting claims, stale evidence on one ticket, and independent eligible work. Show that disabled reset UI can become implementable while final qualification remains blocked on that UI, without allowing unqualified activation.
2. **Evidence applicability:** test through the public CLI with real revisions and supplied manifests. A status-only documentation commit preserves applicable evidence; an acceptance-contract change does not. Relevant source, lockfile, build, runner and runtime changes invalidate the affected scenarios. Unknown dependencies require review/rerun. Preserve original result/revision, historical format semantics and failed observations. Applicability metadata must not invent a pass or integration.
3. **Candidate preparation:** exercise the maintained setup/acceptance entry points against disposable candidate fixtures. Reject another-worktree resolution, a missing required addon, ABI mismatch and stale built/installed artifacts before the feature scenario. Accept a valid selected runtime without requiring unused optional/tooling dependency branches to be universally proven. Use actual native loading/startup on a supported host to substantiate those claims.
4. **Readiness and bounded retries:** reuse operational-reliability public-command tests. Cover wrong target, unsupported WebView output, wrong instrumentation target, unobservable input, worker timeout, missing host access, deadline exhaustion, unchanged retry, five-attempt exhaustion and persistence across process/chat/worktree changes. Mocks qualify control behavior only; supported platform commands and real interaction need a focused available-host demonstration.
5. **Ownership and cleanup:** test controlled owned children/groups, PID reuse, timeout and cleanup failure through the runner interface. Verify unrelated processes and profiles remain untouched. Reattempt admission uses current verified ownership state and preserved failure evidence, without requiring a claim of historical omniscience. Use synthetic private canaries to check that output contains no credentials, private keys or prior clipboard content.
6. **Real runtime demonstrations:** on each available host, run one candidate-bound readiness/interaction scenario with documented cleanup and one selected behavioral scenario through the same runner. For the UX adoption, use the actual Electron counterpart and Android or Chrome Pairing path to show the replacement preflight reaches the product journey; preserve the full ticket's remaining rejection/acceptance/restart/exchange matrix. Native toolbar lifetime claims require the actual toolbar popup and disclose debugger attachment. Missing host/route/account prerequisites remain failed or not-run with a named owner, never fixture-based passes; split unavailable host qualification from independently complete tooling outputs where needed.
7. **Coordinator walkthrough:** a fresh-context review starts at the canonical entry point and obtains the correct candidate, unresolved scenarios, existing authorization, owner and next eligible action without reading archived conversations. Exercise one completed scoped ticket transition and one retained environment blocker. Confirm optional review feedback cannot create a new required gate, and that applicable permissions are reused without being broadened.
8. **Routine integration:** run focused checks during development, npm check before code commits, and npm verify on the resulting integrated candidate. Preserve existing lint/typecheck/test/build and CI wiring. Add deterministic candidate/metadata checks to the cheapest existing suitable check/profile; keep host-dependent smoke tests explicitly separate. Do not duplicate the existing CI or claim hosted execution from a local run.

Acceptance of this improvement effort requires all six improvement areas to have implemented behavior or reviewed workflow changes, their applicable public-boundary checks, and a recorded end-to-end recovery-to-scenario demonstration. Any unavailable required host demonstration remains an explicit unresolved scoped qualification. The success measures are correct candidate selection, finite preparation, bounded diagnostic refusal, accurate evidence reuse/invalidation, a usable dependency frontier, and prompt truthful closure—not a quota of test cases, artifacts or closed UX tickets.

## Out of Scope

- Redesigning Pairing, Admission, Membership Reconciliation, Device Revocation, identity storage, relay transport fallback or manual-reset semantics.
- Completing all remaining UX features or declaring their native gates passed as part of this workflow improvement.
- Weakening native acceptance, route policy, isolation or platform/tool permission boundaries; automatically waiving gates or generating attestations for observations that did not occur.
- A new general-purpose agent framework, test harness, parallel tracker, exhaustive software supply-chain certification system or broad source architecture rewrite.
- Reimplementing operational-reliability PostgreSQL CI, changing the relay service, or importing unrelated specs' unmerged product changes.
- Editing globally installed skills, automatically deleting pre-existing worktrees/profiles, or moving private historical artifacts into Git.
- Publishing a release, deployment, hosted CI execution, personal-profile changes, account sign-in or host-global testing operations without applicable authorization. This planning request performs none of those operations.

## Further Notes

This specification synthesizes the user's October 28 retrospective request and instruction to plan all six improvements. The following observations were refreshed during synthesis and supersede the retrospective's older view where noted:

- The UX integration observed at `a46d5f42cf97224955d9c3dccc89665ecb59d5ee` has 29 resolved, five claimed and two open tickets. These are dated tracker observations, not fresh acceptance results.
- Operational-reliability integration observed at `d3eeb3e09dc3cb2e4a6a5ecf7abc5d1594138185` records all six tickets accepted, including corrected Android readiness and Chrome evidence. Its working copy also contains an uncommitted user-requested five-attempt amendment. Preserve and reconcile that amendment; do not revert to the earlier three-attempt proposal or assume the dirty amendment was included in the committed verification.
- Existing recovery documentation and the status CLI invalidate evidence solely because the integration revision changed, including documentation commits. This spec deliberately replaces that blanket rule with explicit applicability while retaining exact historical observations and conservative handling of unknown impact.
- The earlier retrospective correctly identified real source and environment defects as well as workflow overhead. This effort retains useful tests and fixes; it reduces repeated preparation and recovery work.

Source pointers below are navigation references, not new approval or runtime evidence:

- [Project operations](../../docs/agents/operations.md), [workflow](../../docs/agents/workflow.md), [recovery](../../docs/agents/recovery.md), [verification](../../docs/agents/verification.md) and [local issue conventions](../../docs/agents/issue-tracker.md).
- [Glossary](../../GLOSSARY.md) and accepted [ADRs](../../docs/adr/), particularly 0004, 0005, 0006, 0008 and 0012.
- [UX specification](../ux-implementation/spec.md) and [coverage allocation](../ux-implementation/validation-coverage.md); their original primary-checkout copies are historical planning inputs. Current execution is in the [UX integration run](../../.local/ux-implementation/worktrees/integration/.scratch/ux-implementation/run.md).
- [Current operational-reliability run](../../.local/operational-reliability/worktrees/integration/.scratch/operational-reliability/run.md), [current spec and retry policy](../../.local/operational-reliability/worktrees/integration/.scratch/operational-reliability/spec.md), and its [decision record](../../.local/operational-reliability/worktrees/integration/.scratch/operational-reliability/decisions.md).
- [Status CLI](../../scripts/agent-status.mjs), [real-Git CLI tests](../../tests/agents/agentStatus.test.ts), [source-lookup tests](../../tests/agents/sourceLookup.test.ts), and [routine verification tests](../../tests/tooling/verify.test.ts).
- [Electron acceptance](../../scripts/electron-relay-acceptance.mjs), [Chrome clipboard runner](../../apps/extension/scripts/verify-clipboard-io.mjs), and [Android native acceptance guide](../../docs/android-managed-relay-native-acceptance.md).
- [Pairing dependency-audit evidence](../../.local/ux-implementation/ticket10-continuation-20261027/a907-graph-pointer-independent-audit-20261028.md) and [current reset-runtime ticket](../../.local/ux-implementation/worktrees/integration/.scratch/ux-implementation/issues/29-fence-reset-runtime-work.md).

Local execution and artifact pointers are dated references and may need relocation when their owning worktrees are retired. Future implementation must replace them with durable role-relative metadata through the recovery work described above, without copying private evidence into the specification. The user approved this specification and its testing boundaries on 2026-10-28. Publication creates no implementation claims, ticket splits, native result, code commit or permission expansion.
