# Whole-effort review — 2026-10-07

These reports describe the committed code checkpoint: client `3907ff682b3287dd7bb68ed5dfc3df4c4e3a918a`, relay `17bc5782de9b48b2df05876a76c6a47a87291832`. Fixed points were client `479e05caef8318043b3381bec8af720abe2d8ae9` and relay `b99c7e244aa9ef7f43a199d2763aeb3b5c1afd39`. Final metadata revisions are reviewed and verified separately in the durable local ledger after this record's commit; these hashes are not a claim about a later checkout tip.

## Standards

Reviewer: standards_review. Scope: complete committed agent-workflow effort across both repositories, with focused review of the repair delta. Unrelated primary-checkout auth changes excluded; no code edited.

Reviewed clean revisions:

- Client: `479e05caef8318043b3381bec8af720abe2d8ae9...3907ff682b3287dd7bb68ed5dfc3df4c4e3a918a`. Clean client role checkout.
- Relay: `b99c7e244aa9ef7f43a199d2763aeb3b5c1afd39...17bc5782de9b48b2df05876a76c6a47a87291832`. Clean relay role checkout.

### Documented-standard violations

No outstanding findings.

- Original P2 lookup finding **resolved**: `source-lookup.mjs` strips ambient repository/index/object overrides, preserving the explicit-root and tracked-inventory rules in `docs/agents/operations.md` and `docs/agents/source-lookup.md`. Independent public CLI reproductions for both `GIT_DIR` and `GIT_INDEX_FILE` now return only selected tracked source, omit foreign canaries, and preserve both indexes.
- Original P2 canonical ownership finding **resolved**: retained claims require canonical `claimed` status, consistent with `docs/agents/issue-tracker.md` and `docs/agents/workflow.md`. Independent real-Git reproduction of an active `ready-for-human` claim now exits 1 with `complete: false`, `ticket-owner`, and withheld frontier. The same claim with canonical `claimed` status succeeds.

The repair delta adds exclusive claim branch/worktree checks and independent retained-branch inventory, preserves blocked/handoff ownership through existing metadata, and documents those facts. Input schemas remain unchanged. No new documented-standard violations found.

### Judgment smells

No additional actionable baseline smells; no relay findings. Tooling-enforced rules excluded. Exact-candidate verification receipts report client routine checks and relay routine/race passed; these retain their separate native/live and hosted acceptance boundaries. Ticket 05 resolution, actual ledger refresh, and authorized cleanup remain coordinator finalization steps.

Standards outcome: **passed**, zero outstanding findings.

## Spec

**Result: no outstanding Spec findings.** Reviewed client `3907ff682b3287dd7bb68ed5dfc3df4c4e3a918a` and relay `17bc5782de9b48b2df05876a76c6a47a87291832`. Fixed-point commands: client `git diff 479e05caef8318043b3381bec8af720abe2d8ae9...HEAD`; relay `git diff b99c7e244aa9ef7f43a199d2763aeb3b5c1afd39...HEAD`. Reviewed the complete effort and fix delta against the canonical specification, five tickets, workflow/recovery procedures and accepted ADR-0012.

Original findings:

1. **Claim/ticket status disagreement — fixed.** Independently reran the original active-claim/ready-for-agent reproduction: exit 1, `complete:false`, `ticket-owner` diagnostic and empty frontier. All retained claims now require canonical claimed status, consistent with the existing tracker claim lifecycle; blocked activity requires a recorded blocker.
2. **Shared implementation worktrees — fixed.** Independently reran two owners sharing one branch/worktree: exit 1, `claim-isolation` diagnostics and withheld frontier. Branch and canonical worktree reservation apply per repository role; integration branch reuse is rejected. Permanent public regressions also cover retained blocked/handoff ownership and valid identical branch names in distinct repositories.
3. **Missing retained branch inventory — fixed.** Independently reran an unclaimed branch without a worktree: its name, exact tip, containment classification and empty worktree list are reported. Additional public probes confirmed unverified divergent preservation, exact-tip cherry-pick receipt mapping, a later unmapped tip remaining unverified, and visible failure/withheld frontier above 500 branches. Existing report size bounds remain effective.

Reproduction artifacts remain in the explicit local artifact inventory; the original reusable reproducer is `spec-public-repro.py`. Fixtures use synthetic real Git repositories only.

No new requirement gap or scope creep found in the fixes. ADR-0012 exercise still permits full usable-setup fallback with one retained session and withholds persistent authenticated concurrency. Verification receipts bind client lint/typechecks/79 suites/685 tests/three production builds to the committed candidate; relay is unchanged. I did not repeat full suites. Actual final ledger renewal, resolution/snapshot and permitted cleanup remain coordinator steps; hosted/native/live acceptance remains separate.

## Disposition and verification

Initial Standards review found two P2 violations; initial Spec review found three findings (two P1, one P2), with one overlap. One isolated remediation implementer fixed all four distinct issues in client `3907ff6`: ambient Git override isolation, authoritative claim/status agreement, exclusive claim branches/worktrees, and retained branch inventory. Public red-to-green tests and independent reproductions confirm the fixes. No findings remain on either axis.

Client routine verification on the exact fix commit passed lint (zero errors, 624 existing warnings), all typechecks, 79 suites/685 tests and Electron/Android web/Chrome production builds. Relay routine and race profiles passed on the exact relay code checkpoint; all eleven deterministic suites and public verification fixtures ran. Maintained links and fresh-context walkthroughs passed in both roles.

Local artifact names: `initial-standards-review.md`, `initial-spec-review.md`, `fix-dispositions.md`, `fix-candidate-receipt.json`, `fix-integration-receipt.json`, `standards-review-final.md`, `spec-review-final.md`, `fix-verify.log`, `whole-relay-routine.log`, and `whole-relay-race.log`. Their local directory is supplied through configuration and stays outside tracked portable metadata.

Hosted CI execution, real PostgreSQL/native image runs, OCI/cluster/provider qualification, native packaging/signing, browser/device/live acceptance and forced live transfers are not run. No push, PR, publication or deployment occurred. Independent existing acceptance tickets and deferred capacity ticket 33 retain their prior outcomes.
