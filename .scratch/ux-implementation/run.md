# UX implementation run — 2026-10-10

Coordinator: this Codex task. Run ID: `ux-implementation-20261010`.

## Scope and access

- Canonical execution state: individual `issues/*.md` files in this directory. `spec.md`, `backlog.md`, `catalog.json`, `traceability.md` and `validation-coverage.md` are the approved handoff; the catalog is not a claim tracker.
- Repository role `client`: `/Users/invine/src/js/clipp`. Integration worktree: `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/integration`, branch `codex/ux-implementation-integration`, initial full commit `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`.
- Repository role `relay`: `/Users/invine/src/go/clipp-relay`, external qualification owner only. This run establishes no relay integration baseline and changes no relay source.
- The approved `.scratch/ux-implementation-plan/` and `.scratch/ux-implementation/` documents, plus narrative `.scratch/ux-study/` Markdown and five top-level validation JSON files, were copied unchanged from the primary checkout into this isolated branch. Study media/evidence remains available at the original client root; it is historical evidence, not candidate validation.
- Local preservation inventory and future candidate receipts live under `/Users/invine/src/js/clipp/.local/ux-implementation/run-20261010/`. This ignored directory is retained outside disposable implementer worktrees.

## Preservation and authorization

The primary checkout is `codex/agent-workflow-integration` at `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`. Its two unrelated modified files, `apps/electron/src/managedRelayAuth.ts` and `tests/electron/managedRelayAuth.test.ts`, stay untouched there; their current hashes are in `preserved-tracked-hashes.txt`. The three untracked UX directories remain untouched there. Existing linked worktrees, branches, ignored `.local/` artifacts and any stashes are retained; dated inventories are in the ignored run directory. The remote tracking branch is five commits ahead of the primary checkout; this run starts from the inspected local planning baseline, without changing the primary checkout or importing unrelated remote work.

The user authorized implementing the accepted UX specification with isolated local branches/worktrees and at most two implementers. Local tests, documentation, source edits, integration and local commits are within that request. Push, PR, publication, deployment, hosted CI, account sign-in, fresh global clipboard/display/permission intervals and live/native acceptance require their own applicable authorization or coordinated procedure. No prior run grants them.

## Priority and gates

Dispatch begins with ticket 01, Chrome preference integrity. Follow the ticket dependency frontier plus the approved priority order in `spec.md`: six first-milestone repairs, remaining correctness/access, compact workspace, then additional controls. The coordinator alone claims, integrates and resolves tickets. No more than two implementers run concurrently; each gets its own `codex/` branch and worktree based on the current integration tip.

The acceptance matrix, candidate/external/retained classifications and all 41 gap mappings in `validation-coverage.md` remain authoritative. Candidate evidence must name exact revision, dirty-state hash, host/environment, commands, actual observations and unrun/unavailable cases. A foundational ticket can finish before finding closure; finding status remains separate in `traceability.md`. Missing required candidate evidence keeps the affected claim incomplete. Sign-in remains user-deferred. Old clipboard and display intervals remain closed. Existing relay and extension clipboard tickets retain their owners.

At each handoff: inspect Git tips and dirty state, incorporate the current integration branch without discarding work, preserve receipts outside disposable worktrees, run affected checks and `npm run check` before a code commit. On the integrated candidate, run the applicable routine verification and two-axis Standards/Spec review against the fixed initial commit. Resolve only after the required candidate gates pass; leave retained/external qualifications explicitly unverified.
