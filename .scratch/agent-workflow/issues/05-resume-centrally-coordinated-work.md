# 05: Resume centrally coordinated work

**What to build:** Let the coordinator or a fresh replacement session reconstruct current multi-repository work, identify inconsistencies and choose eligible tickets from durable metadata and Git without reading the whole chat.

**Blocked by:** [02: Apply the architectural decision checkpoint](02-apply-architectural-decision-checkpoint.md).

**Status:** ready-for-agent

Repository scope: both projects, with one canonical ledger/status implementation in Clipp. Parent: [agent workflow specification](../spec.md). Covers AC5–AC8 and the coordination portion of AC9, retrospective improvement 5. Test boundaries and ticket graph approved 2026-10-07; implementation has not started.

## Acceptance criteria

- [ ] Define a versioned run ledger for repository roles, approved baselines, integration branches, coordinator/claim owners, decisions, explicit external blockers and revision-bound evidence. Existing Markdown ticket Status/Blocked by remain authoritative.
- [ ] Provide a read-only CLI with concise human and versioned machine output for repository/branch tips, worktrees and dirty counts, stash identifiers, containment/integration evidence, owner consistency and the derived eligible frontier.
- [ ] Missing roots, malformed/cyclic/missing dependencies, duplicate/conflicting claims, changed integration tips and stale/unavailable evidence produce actionable incomplete/error results; they cannot appear as a successful complete status or authorize assignment.
- [ ] Account for cherry-pick/squash integration using explicit verified mappings; lack of ancestry is not automatic proof of unintegrated work, and recorded intent alone is not proof of acceptance.
- [ ] Enforce or validate the two-implementer limit and coordinator ownership before assignment. A blocked ticket does not prevent another eligible ticket from being selected; deferred tickets remain excluded and stale claims are never silently reassigned.
- [ ] Record a claim before dispatch; record source/integration commits and successful applicable checks/reviews before resolution. Preserve an explicit cross-repository boundary when one repository has integrated and the other has not.
- [ ] A temporary real-Git recovery demonstration interrupts after a ticket commit but before integration, resumes with an unrelated dirty worktree and a blocked ticket, detects the outstanding result, preserves all state and finds eligible work.
- [ ] Command tests cover real linked worktrees, staged/unstaged/untracked files, stashes, filenames with spaces, missing companion, inconsistent state, stale evidence and clean completion. Read-only commands leave Git refs/index/files untouched and never read profile, credential, diff or stash contents.
- [ ] Record a current status snapshot for this implementation effort without changing historical backlog outcomes. Link the command/recovery procedure from both project entry points and retain the existing capacity deferral.

## Implementation context

Follow ticket 02's procedure and the [specification](../spec.md#coordination-evidence-and-recovery). Keep the tool small: a local metadata/CLI interface, not an autonomous scheduler or a new tracker. Local root mappings and private artifact locations remain outside tracked portable metadata. Claims and resolutions remain coordinator actions; diagnostic tools do not mutate or repair them automatically.

Tickets 03 and 04 are not blockers: use available verification commands and evidence in this slice, then wire the completed effort's final verification during coordinator integration. Final whole-effort review is an orchestration step, not a substitute for per-ticket checks.

## Comments

- Planning publication only; no claim or implementation evidence yet.
