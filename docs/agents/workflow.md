# Implementation, decisions and recovery

Use this procedure before assigning implementation, reviewing its scope, integrating results or resuming interrupted work. Start from [project operations](operations.md), the selected feature's specification and tickets, [local tracker conventions](issue-tracker.md), the [glossary](../../GLOSSARY.md) and relevant [accepted ADRs](../adr/). This effort's [canonical tracker](../../.scratch/agent-workflow/README.md) and [run record](../../.scratch/agent-workflow/run.md) belong to Clipp; the relay checkout supplies a pointer rather than duplicate claimable tickets.

## Establish the run

The coordinator records these facts before dispatch:

- Run identifier and coordinator; canonical tracker, specification and ticket paths.
- Participating repository roles (`client` for Clipp, `relay` for clipp-relay), explicit local root mapping, approved starting commits and one integration branch with its observed full commit hash per role. Tracked references use roles and repository-relative paths; local roots and private artifact directories are supplied explicitly.
- Applicable verification profiles, acceptance gates and authorization limits. This effort permits local preparation and commits; push, PR creation, publication, deployment, hosted CI and live acceptance remain outside this run.
- At most two active implementation agents across the run, each with a fresh ticket context and isolated branch/worktree in every repository it changes.
- An inventory of existing worktrees, dirty state, retained branches, stashes and required ignored artifacts. Preserve these separately from newly created implementation worktrees.

Inspect current Git facts before trusting a dated record. Two repositories have two tips and separate integration steps; recording both does not make their integration atomic. Completion: every required role is accessible, its current integration baseline is identified, and the run's ownership and limits are explicit.

## Assess decisions before dispatch

The coordinator adds a short assessment to the ticket context or a linked decision record. Record the requested observable outcome, affected glossary concepts, relevant accepted decision references and the invariants the interpretation preserves or changes. For routine work, a sentence stating the preserved invariants with the relevant ADR is sufficient.

| Assessment                            | Dispatch boundary                                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserves the accepted contract       | Proceed within the authorized ticket scope. Reuse an earlier user approval whose recorded scope clearly matches; no redundant approval is needed.                                                                                                   |
| Changes an accepted invariant         | Withhold the affected implementation until an explicit user decision is recorded in an accepted ADR or linked decision record. Record the proposal, affected invariant, user decision evidence and scope; link the accepted record before dispatch. |
| Scope or decision evidence is unclear | Record the unresolved question and obtain the user decision needed to settle it. Continue unrelated eligible work.                                                                                                                                  |

An agent changing a proposal's status is not user approval. A linked decision record must identify the actual user instruction, its date/source and the approved scope; an implementer's interpretation or a passing fixture does not substitute for it. When the scope changes during implementation, return the affected work to this checkpoint before implementing the changed contract. Completion: the ticket's requested behavior and invariant assessment support dispatch, or the coordinator has recorded the decision blocker and withheld that work.

### Transport review exercise

Use [ADR-0012](../adr/0012-relay-transport-fallback-and-concurrent-sessions.md) and the selected relay checkout's `GLOSSARY.md` for Relay Session and Relay Quota semantics.

| Requested behavior                                                                                                                                                                                                 | Assessment and outcome                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Try eligible transports through usable relay setup; if a verified dial then encounters a transport-local setup failure, give later eligible families a bounded opportunity. Retry selection after connection loss. | Preserves ADR-0012: proceed without another approval. Retain one effective authenticated Relay Session per Relay Configuration, keep a healthy selected connection and preserve independent configured relays. Peer ID verification precedes credentials; authentication/quota refusals and authoritative retry hints retain their policy/backoff behavior. A socket-only fallback demonstration is insufficient. |
| Keep persistent authenticated TCP, WSS and WebRTC Direct sessions, including a warm standby, for one Relay Configuration.                                                                                          | Changes the retained-session invariant, physical-session quota use and same-Peer-ID ownership contract. Withhold this work pending a separate explicit user decision with an accepted record. The accepted fallback decision and historical concurrent candidate do not authorize it.                                                                                                                             |

Review actual behavior, not a feature label such as “fallback.” Bounded overlapping attempts are compatible with the accepted one-retained-session policy; persistent authenticated alternatives require the second boundary. Changing quota accounting to one Device Identity also requires its own explicit decision.

## Claim and dispatch

Only the coordinator updates canonical claims, blocking metadata, integration records and ticket resolution. The existing ticket `Status` and `Blocked by` fields remain authoritative. Run metadata supplements ownership, decisions, external blockers and evidence; it stores neither a competing ticket status nor a manually ordered frontier.

1. Read the canonical ticket and its dependencies, current Git state, decision assessment and predecessor evidence. Select an open, unclaimed eligible ticket whose required predecessors are resolved and whose decision/external blockers are cleared. Deferred work stays excluded; this effort does not change the managed-relay backlog or deferred capacity ticket 33.
2. Save one claim with the coordinator's dispatch identity and owner before assignment. Check the two-implementer bound and conflicting claims. A blocked ticket retains its reason and owner; it need not occupy active implementation capacity while unrelated eligible work proceeds.
3. Create or reuse an isolated ticket branch/worktree from each relevant current integration tip. Record its role, branch, baseline hash and worktree identity. Inspect and preserve existing changes before merging or rebasing a changed baseline; never use a reset of dirty work to satisfy the baseline.
4. Give the implementer a fresh context containing the ticket/specification paths, decision assessment and accepted references, repository roles/local roots, baseline and integration hashes, claim identity, relevant predecessor evidence, validation seams, applicable project instructions and run limits. Unrelated conversation history is unnecessary.

Completion: the saved claim has exactly one owner, each participating worktree has the intended inspected baseline, and the implementer can determine scope, sources and verification from the dispatch alone.

## Handoff, integration and resolution

The implementer preserves work, applies project instructions and validates the approved seams. Before handoff, inspect current integration tips again and incorporate changes by an inspected merge/rebase, resolving conflicts and rerunning affected checks. Leave required artifacts available outside disposable worktrees. The coordinator verifies the handoff against current Git, integrates each role, then runs applicable checks on the resulting integration revisions.

Record the following evidence together, using full commit hashes and explicit repository roles:

| Evidence     | Required content                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source       | Ticket/claim, owner, baseline, source branch and source commit(s) per role; remaining dirty state or preserved work.                                                                                                                                                                                                   |
| Integration  | Integration branch and resulting commit per role; a mapping from source commits to integrated commits when squash/cherry-pick changes ancestry. Distinguish demonstrated integration from branch containment.                                                                                                          |
| Verification | Exact command/check profile, tool versions, outcome, tested source or integrated revisions per role, observed time and artifact references. Identify failed, unavailable and not-run profiles, including native/live gates outside routine coverage.                                                                   |
| Review       | Standards and Spec outcomes, exact reviewed revisions per role, findings and their disposition, reviewer identity and artifact references. Spec review compares requested behavior and the assessment with the implementation and accepted decision; Standards review assesses project conventions and judgment calls. |
| Resolution   | Coordinator's determination that the scoped result is integrated, reviewed and freshly verified; links to the evidence and any independent remaining acceptance work. Only then update the canonical ticket to resolved.                                                                                               |

A local commit alone proves neither integration nor acceptance. If a required artifact is missing or a tested/reviewed revision changed, mark that evidence unavailable or stale and renew the affected checks/review before resolution. Private artifacts may have explicit local references without copying their contents into Git. For cross-repository work, every participating role needs evidence for its result; incomplete integration stays visible.

Deterministic validation can check required fields, references, Git facts and command results. It cannot establish semantic ADR compliance; human Spec review owns that comparison. Validate documentation with maintained-link checks, a fresh-context walkthrough and the two transport scenarios above, without tests tied to exact prose. Complete the effort with Standards and Spec reviews across both repositories and fix findings before the coordinator closes it.

## Resume and recover

Use the [read-only status command and durable ledger](recovery.md) to reconstruct these facts from explicit roots. Its versioned report withholds the frontier on inconsistent required state; coordinator reconciliation remains explicit.

1. Reopen the canonical tracker and run metadata, then inspect both selected repositories: HEAD/branch, integration tip, worktree identities and dirty counts, branch containment and stash identifiers. Inspect metadata first; source secrets, stash contents and runtime profiles are unnecessary for status.
2. Compare observed Git with saved claims, baselines, integration mappings and evidence. Report inaccessible required roots/worktrees, duplicate claims, missing/cyclic dependencies, ticket/ownership disagreement, changed recorded tips and missing/stale artifacts. Withhold assignments that depend on inconsistent state; the coordinator reconciles the records with current facts. Elapsed time never releases a claim automatically.
3. Locate committed but unintegrated results and preserved dirty/ignored work. A retained branch or stash is preservation evidence, not demonstrated integration. Resume the existing claim or integrate its result only after checking its scope, decision evidence and current baseline. Record each role's integration independently if an interruption happened between repositories.
4. Keep decision/external blockers and owners visible; select other eligible work within the active-agent bound. Renew evidence after integrating or changing revisions, then resolve only through the preceding completion gate.
5. Clean up only newly created implementation worktrees after required artifacts are preserved and integration is verified. Retain pre-existing worktrees, branches, stashes and uncommitted files unless separately authorized for cleanup.

Completion: the coordinator can account for every active claim and outstanding result from current records and Git, required work is retained, unsafe assignments are withheld, and fresh evidence supports any resolution. Dated recovery reports remain evidence of their recorded environment, not current checkout truth.
