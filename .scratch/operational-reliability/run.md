# Operational reliability implementation run

Coordinator: `/root`. Design, testing boundaries and six-ticket graph approved by the user on 2026-10-25. Canonical tickets are in this directory; at most two implementers are active. Local implementation and commits only; publication/deployment require applicable authorization. Clipboard overwrite permission is recorded in [decisions](decisions.md).

Client baseline: `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. Relay baseline: `2b8ad5da548511a6e3dffffcd99765f057c1b1fe`. Each repository uses `codex/operational-reliability-integration` in its own isolated integration worktree. Primary checkouts and existing worktrees/stashes remain preserved.

Durable current run ledger and local root/artifact mappings are client:`.local/operational-reliability/run-20261025/ledger.json` and `local.json`. The initial `planning-inventory.json` records existing branches/worktrees/stashes and dirty metadata without private contents. `artifacts/` retains evidence outside disposable worktrees. Historical records remain evidence for their recorded revisions only.

## Dispatch

- 01: claimed by `/root/ticket_01`, relay isolated ticket branch based on relay integration baseline.
- 05: claimed by `/root/ticket_05`, client isolated ticket branch based on client integration baseline.

Each ticket preserves product/transport invariants and changes only the approved operational scope. Implementers use the approved public testing seams and TDD; the coordinator owns canonical claims and resolution. Integration requires merger review and fresh checks; final Standards/Spec review remains outstanding.
