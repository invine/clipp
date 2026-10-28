# Project agent workflow and verification

**Status:** resolved

Planning date: 2026-10-07. Test boundaries and the five-ticket breakdown approved by the operator on 2026-10-07. Scope: retrospective improvements 1, 3, 5 and 7 for Clipp and clipp-relay. The associated README is the navigation entry point and records current source pointers; this specification defines behavior.

## Problem Statement

The operator had to correct an architectural interpretation after concurrent Relay Sessions were implemented, repeatedly reconstruct worktree and ticket state, and resolve failures that existing checks did not run automatically. Build caches and runtime profiles made broad searches expensive. Historical handoffs sometimes appeared to describe the current checkout. Agents need a reproducible way to establish approved behavior, find the right sources, verify changes and resume coordinated work without relying on a long conversation.

## Solution

Provide a project-specific workflow, short navigation entry points, verification commands shared by local execution and CI, and a coordinator ledger with a read-only status command. Preserve the existing local Markdown tracker, accepted ADRs, runtime acceptance boundaries and two-axis review. Use one canonical ticket set for this effort across the two repositories.

An agent starts from current repository facts and a ticket, records whether the proposed behavior preserves accepted decisions, then implements within an isolated worktree. The coordinator owns claims, integration and resolution. Current status is computed from tickets and Git; historical receipts remain evidence of the exact revisions they tested.

## User Stories

1. As the operator, I want architectural changes identified before implementation, so that an ambiguous request cannot silently replace an accepted contract.
2. As an implementer, I want pointers to relevant accepted ADRs and glossary terms, so that I can interpret a ticket without reading every design document.
3. As the operator, I want routine changes within an accepted contract to proceed without a new approval request, so that the decision checkpoint does not obstruct ordinary work.
4. As a Spec reviewer, I want the requested behavior, invariant assessment and accepted decision linked together, so that correct-looking code does not hide unapproved scope.
5. As a Standards reviewer, I want mechanical rules delegated to executable checks, so that review time goes to judgment.
6. As an implementer, I want the same verification entry point locally and in CI, so that a local pass has a clear meaning.
7. As a maintainer, I want Clipp lint, typechecks, tests and runtime builds checked routinely, so that a missing invocation does not let errors pass.
8. As a maintainer, I want relay Go, chart and operator fixture checks checked routinely, so that existing protections stay exercised.
9. As a contributor, I want verification to run without publication credentials, cluster access or an approved test account, so that an ordinary change can be checked independently.
10. As the operator, I want native and live checks distinguished from routine verification, so that missing devices or credentials never appear as passing acceptance.
11. As the coordinator, I want one authoritative claim per ticket, so that two agents cannot implement the same work accidentally.
12. As the coordinator, I want at most two active implementation agents in isolated worktrees, so that work stays parallel and reviewable.
13. As an implementer, I want a fresh context containing my ticket and source pointers, so that unrelated session history does not influence the change.
14. As the coordinator, I want the next eligible tickets computed from blocking edges, so that blocked work does not stall unrelated work.
15. As the operator, I want current commits, dirty worktrees, retained branches and stashes reported from Git, so that preservation is distinguishable from integration.
16. As a returning agent, I want to detect disagreement between the ledger, tickets and Git after an interruption, so that I do not act on stale ownership or evidence.
17. As the coordinator, I want verification and review evidence tied to exact integrated revisions, so that ticket completion is justified.
18. As the operator, I want existing uncommitted work, ignored artifacts and recovery stashes preserved, so that consolidation or cleanup cannot discard them.
19. As an agent, I want bounded source lookup that excludes caches and runtime profiles by default, so that exploration remains relevant and avoids private data.
20. As a new contributor, I want to locate build, acceptance, recovery and coordination procedures from either repository, so that the workspace layout is understandable.
21. As the operator, I want a missing companion repository or tool reported explicitly, so that incomplete status cannot be mistaken for success.
22. As the operator, I want local preparation to stop before pushing, publication or deployment, so that those actions retain their existing authorization boundary.

## Implementation Decisions

### Scope and sources of truth

- This is project-specific tooling and documentation. Personal skills and global agent configuration are outside the change.
- Clipp owns this effort's canonical specification, tickets and coordinator metadata. The relay checkout has a pointer, not a second set of claimable tickets. Existing managed-relay backlog ownership is unchanged.
- The existing ticket Status and Blocked by fields remain authoritative. The ledger adds run ownership, decision references, integration references, external blockers and evidence links; it does not maintain a competing ticket status or a manually ordered frontier.
- Repository roots are explicit inputs or local configuration. Portable tracked metadata uses repository roles and relative references, not the operator's home directory. Missing roots and inaccessible worktrees are visible errors.
- Accepted domain vocabulary remains in the current glossaries; this effort does not rename domain concepts or reopen accepted Relay Session policy.

### Architectural decision checkpoint

- Before dispatch, the coordinator records the requested outcome, relevant accepted decisions and an assessment of preserved or changed invariants in the ticket's context. A short preserved-invariants assessment is sufficient for routine work.
- When a proposed interpretation changes an accepted invariant, the affected work waits for an explicit user decision recorded in an accepted ADR or linked decision record. An agent cannot self-approve a proposal by changing its status. Previously supplied approval is reused when its scope clearly matches.
- The request to try eligible relay transports must preserve one retained Relay Session under the accepted fallback ADR. Persistent authenticated sessions require a separate decision. This session's ambiguity is the workflow's concrete review exercise.
- Spec review checks the assessment against the implementation and accepted decision. Standards review retains judgment calls; machine-checkable metadata, links and command behavior are validated by tooling. A metadata checker cannot establish that prose semantically matches an ADR.

### Navigation and bounded lookup

- Each repository exposes a short agent entry point that routes build/verification, runtime acceptance, operator setup, recovery and coordination tasks to authoritative references.
- Keep project constraints and genuinely costly-to-discover facts near their trigger. Move duplicated command catalogs and detailed runtime descriptions behind pointers. Correct current glossary pointers without rewriting historical evidence.
- A source lookup command lists relevant files and searches an explicit scope. It uses tracked source/document paths plus explicitly selected nonignored task files; it excludes Git internals, nested worktrees, dependencies, build outputs, caches, private runtime profiles and recovery data by default. An explicit path can select a worktree as the repository root without recursively searching other worktrees.
- Bound returned matches and output size, report truncation, and support filenames with spaces and unusual characters. Source lookup reads files; status reads Git metadata. Neither executes text read from tickets nor opens profile/credential contents.

### Verification contracts

- Each repository has one documented routine verification entry point. Local execution and ordinary pull-request/main CI invoke that same entry point. The existing client pre-commit check remains effective and gains lint coverage without making every commit run native or live acceptance.
- Client routine verification runs existing ESLint, all current runtime/shared typechecks, Jest once, and production compilation for Electron, Android web assets and Chrome. Reuse the current commands and test configuration. Preserve the existing distinction between Electron build output, native Android packaging, browser fixtures and live acceptance.
- Relay routine verification checks Go formatting, dependencies, tests, vet and build, plus existing deterministic image-contract, chart, initialization-guard, preflight-input and installation-metadata suites. Race coverage runs in a supported CI job or an explicit verification profile, with its prerequisite and result reported separately.
- Missing required tools and any failed constituent check make verification fail. Existing lint/format failures are fixed within the ticket or reported as concrete blockers; rules are not weakened or broad exclusions added merely to make CI green.
- Hosted verification uses ordinary pull-request and main-branch events with read-only repository permissions. It needs no registry write credentials, kubeconfig, OCI signing key or live OAuth account. Preserve the existing manual publication workflow and its independent authorization.
- Provision compatible Node/npm and Go versions from repository requirements, along with Helm, Python and Ruby for the existing suites. Record tool versions in results. Dependency fetching during setup is expected; it does not authorize external service mutations.
- Live OCI journal checks, cluster qualification, forced runtime transfers, signed releases and device instrumentation retain their documented separate gates. A routine pass must list those outside its coverage rather than silently treating a skip as success.
- Under the local-only constraint, validate workflow configuration and execute its commands locally. Hosted CI execution remains not run until a later authorized push; that external run is not required to finish the local implementation tickets.

### Coordination, evidence and recovery

- A run names its canonical tracker, explicit repository roles, approved starting commits, one integration branch per participating repository, maximum two implementers and applicable publication constraints. Two Git repositories require two branch tips; a cross-repository result records both, without pretending integration is atomic across repositories.
- Only the coordinator changes canonical claims, blocking metadata and ticket resolution. Record a claim before dispatch. Implementers receive fresh contexts, isolated branches/worktrees based on the current relevant integration tip, and pointers to the ticket, specification, accepted decisions and required predecessor evidence.
- Reconcile a changed integration baseline by merge/rebase only after inspecting and preserving work. Never satisfy a baseline check by blindly resetting a dirty worktree.
- The read-only status command emits a human summary and a versioned machine-readable report: observed time, repository HEAD/branch, integration tip, worktree metadata and dirty counts, stash identifiers, branch containment, ticket state, owner/claim consistency, eligible frontier, decision/external blockers and evidence freshness. It does not read stash or diff contents, source secrets, or automatically mutate anything.
- Distinguish commit ancestry from demonstrated integration when cherry-picks or squash commits are involved. An explicit integration record may map source commits to integrated commits; uncertainty is reported as unverified rather than silently calling work merged.
- Evidence records the command/check profile, outcome, exact source and integration revision(s), review result and artifact reference. A private artifact can be referenced locally without copying its contents into Git. Missing artifacts or changed revisions make evidence stale/unavailable, not passing.
- If tickets and ledger disagree, a dependency is missing/cyclic, a claim is duplicated, a required root is unavailable, or the recorded branch tip changed, report the inconsistency and withhold unsafe assignment. Recovery requires coordinator reconciliation; elapsed time does not release a claim automatically.
- A blocked ticket retains its reason and owner; other eligible tickets continue. Deferred capacity ticket 33 stays excluded. Existing unresolved runtime/external acceptance tickets cannot become resolved merely because this tooling was installed.
- Integrate and verify each result before marking its ticket resolved. Finish with Standards and Spec reviews of the complete effort across both repositories and fix findings. A local commit is not proof of acceptance.
- Cleanup applies only to newly created implementation worktrees after preserving required artifacts and verifying integration. Existing worktrees, stashes, branches and uncommitted files are inventoried and retained unless separately authorized for cleanup.

## Testing Decisions

- Prefer the public command boundary: invocation, exit status, structured result and filesystem effects. Do not test private helpers or assert implementation-shaped snapshots.
- Test status/coordination against temporary real Git repositories with branches, linked worktrees, staged/unstaged/untracked changes, stashes and ticket fixtures. Exercise a clean run, missing companion, conflicting claims, missing/cyclic dependencies, blocked/deferred tickets, cherry-pick integration, stale evidence and restart after incomplete integration. Confirm identical Git references, index and worktree contents before and after read-only commands.
- Test bounded lookup through its CLI with synthetic source files and excluded cache/profile canaries. Assert relevant results, explicit truncation and absence of excluded content. Never use the operator's real private profile as a test fixture.
- Run each verification command with the actual existing suites. Use narrow subprocess fixtures to establish nonzero propagation and missing-prerequisite behavior; those fixtures do not replace real checks. Reuse the relay's existing command/Helm fixture style and the client's existing test runner.
- Validate that CI invokes the same public commands and has the specified events/permissions. Demonstrate that an intentionally failing constituent check fails the entry point; report hosted execution separately under the no-push constraint.
- Validate navigation by resolving maintained links and a fresh-context walkthrough from each entry point. Historical dated reports remain historical, not rewritten as current truth. No test should assert exact prose, a document line count or a particular private helper layout.
- Evaluate the architectural checkpoint with two scenarios: ordinary fallback work proceeds under the accepted ADR; persistent concurrency is withheld pending a user decision. Human Spec review assesses meaning; deterministic validation checks only required decision evidence and references.
- End-to-end recovery demonstration: interrupt an isolated fixture run after one result is committed but before integration, restart from the ledger, detect the outstanding result, retain an unrelated dirty worktree, and choose an eligible ticket while another is blocked. A result becomes resolved only after integration and fresh verification evidence.

## Observable Acceptance Criteria

- AC1: From either repository, a fresh agent can find authoritative workflow, glossary, verification, acceptance and recovery sources using the short entry point and bounded lookup, without searching private/generated trees.
- AC2: The fallback/concurrency exercise produces the correct decision boundary; routine work needs no redundant approval and unaccepted contract changes cannot be dispatched as approved work.
- AC3: Clipp's routine entry point runs lint, all typechecks, Jest and all three production builds; any failed required check fails the command. Its pre-commit and CI wiring are verified.
- AC4: Relay routine verification runs Go and the enumerated existing deterministic script suites; any failed required check fails the command. CI configuration provides routine events and no publication capability.
- AC5: Status reports current Git/ticket facts for both explicit repositories, computes only the eligible frontier, identifies preservation versus integration, and exits unsuccessfully with actionable diagnostics for inconsistent or incomplete required state.
- AC6: Claims remain centrally owned, no more than two implementation agents run concurrently, each ticket begins in fresh context from the current integration baseline, and resolution requires reviewed, integrated, freshly verified work.
- AC7: The interruption/recovery demonstration retains existing changes and selects eligible work correctly without conversation history or automatic destructive repair.
- AC8: Source lookup and status exclude private contents, are bounded and read-only, and expose machine-readable output with a documented version.
- AC9: New CI/workflow/tooling is locally verified and committed; no remote run, live acceptance, push, publication or deployment is claimed or performed without its separate authorization.

## Out of Scope

- Retrospective wizard execution tests, Chrome install/update identity tooling and an offline Identity Rotation command (improvements 2, 4 and 6).
- Changes to Relay Session policy, product behavior, device credentials, installed profiles, cluster resources or capacity qualification.
- Personal/global skill edits, a general-purpose agent scheduler, a new issue tracker, remote messaging, automatic claim stealing or automatic worktree/stash cleanup.
- New native/device/live acceptance requirements or new release publication mechanisms. Existing gates remain applicable to their original tickets.
- Repository-host administration such as changing branch protection or requiring checks remotely; configuration can be prepared locally and external activation recorded separately.

## Further Notes

The canonical README supplies source pointers, baseline observations, the ticket graph and the handoff command. Baseline hashes are historical observations; the implementer must re-read Git state before work. No runtime or infrastructure change is requested by this planning publication.
