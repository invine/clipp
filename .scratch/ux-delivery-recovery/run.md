# UX delivery recovery implementation run

Coordinator: `/root`; started 2026-10-28 on the user’s explicit implement-spec instruction. Canonical tickets are the numbered files in this directory. This integration checkout is the current authority; the primary planning copy points here.

## Lineage and preservation

Client main baseline: `479e05caef8318043b3381bec8af720abe2d8ae9`. Integration branch: `codex/ux-delivery-recovery-integration`; checkout: `.local/ux-delivery-recovery/worktrees/integration` relative to the primary client root. Creation HEAD was verified equal to main. Private root mappings and pre-existing worktree/dirty/stash inventories are outside disposable worktrees at `.local/ux-delivery-recovery/evidence` in the primary client root. Existing work, including the dirty workflow lineage instructions and operational-reliability five-attempt amendment, is preserved in place. No relay source changes are planned.

## Authorization and checks

Local preparation, isolated branches, implementation and local commits are authorized. No push, PR, deployment, hosted CI, account access or expanded native/clipboard permissions are granted. Approved test seams: specification Testing Decisions (public real-Git status CLI, preparation/acceptance entry points, existing npm checks and focused actual-runtime demonstrations). Product invariants in ADRs 0004/0005/0006/0008/0012 remain unchanged. Two implementation agents maximum; only conflicting native resources serialize.

## Observed prerequisite state

Main lacks `scripts/agent-status.mjs`, `tests/agents/agentStatus.test.ts`, `scripts/verify.mjs` and `docs/agents/workflow.md`: the agent-workflow effort is also unmerged. Its observed primary branch tip is `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. Operational-reliability integration is `d3eeb3e09dc3cb2e4a6a5ecf7abc5d1594138185`, not an ancestor of main; its working tree retains the uncommitted five-attempt amendment. Per the approved main-first policy, dependent tooling stays blocked until these prerequisites reach main. No unrelated implementation will be copied or stacked. Independent preparation and read-only graph work may proceed.

## Dispatch and evidence

Ticket-level claims and evidence follow below. No native gates have been observed in this run.

- 01: claimed for `/root/graph`; graph/allocation preparation only until main supplies the public status CLI. Product semantics and live UX claims are preserved; no migration or activation.
- 02: claimed for `/root/candidate`; candidate preparation on main’s existing acceptance/setup boundaries, no native qualification. Baselines and exact commits are recorded at handoff.
