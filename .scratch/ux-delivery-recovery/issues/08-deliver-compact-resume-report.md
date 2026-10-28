# 08: Resume from one compact, authoritative report

**What to build:** Let a fresh coordinator identify the real candidate, remaining work and next eligible action from the canonical entry point without reconstructing historical conversations.

**Blocked by:** [01 — Define finite acceptance and refine the UX dependency graph](01-refine-acceptance-and-dependencies.md), [03 — Reuse unaffected evidence safely](03-reuse-unaffected-evidence.md).

**Status:** claimed

**Assignee:** `/root/compact_resume`

**Claim:** ux-delivery-recovery-20261028-08; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [ ] Extend the existing read-only status CLI to report the current candidate, canonical claims, scoped outputs, remaining scenarios and applicability, blockers, active capacity, authorization references and next eligible actions.
- [ ] Derive statuses and the frontier from authoritative inputs. The compact summary is a view over those inputs, not another manually maintained ticket-status store.
- [ ] Maintain a single current effort entry point and explicit active integration/run pointer, with local roots in local configuration. Validate pointer consistency and clearly distinguish archival planning copies from live execution state.
- [ ] Provide a concise current-summary format and migration that archives superseded narrative while retaining failed receipts and historical versions. Remove stale live assertions such as execution not having started when current records prove otherwise.
- [ ] Reuse operational-reliability authorization and operational metadata from its main-integrated version. Unknown, revoked or superseded scope remains explicit; the report never grants permission or executes a recorded command.
- [ ] Keep routine reads and output bounded to selected metadata and Git facts. Do not scan private profiles, all historical artifacts or clipboard contents. Required evidence remains outside disposable worktrees.
- [ ] Public CLI and navigation checks cover stale pointers, wrong candidate, missing references, historical compatibility, scoped stale evidence and conflicting ownership; synthetic private canaries never appear in output.
- [ ] A fresh-context walkthrough using a populated fixture obtains the correct candidate, owners, blockers, applicable authorization and next action from the entry point, current report and selected ticket alone.
- [ ] Complete applicable checks and review. Supply the verified migration for ticket 10 to apply to the active UX effort; retain pre-existing worktrees and artifacts.

**Scope boundary:** This ticket delivers current-state recovery and its verified migration. It does not automatically mutate claims, close tickets or clean up historical worktrees.
