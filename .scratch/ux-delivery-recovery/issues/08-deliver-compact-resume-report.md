# 08: Resume from one compact, authoritative report

**What to build:** Let a fresh coordinator identify the real candidate, remaining work and next eligible action from the canonical entry point without reconstructing historical conversations.

**Blocked by:** [01 — Define finite acceptance and refine the UX dependency graph](01-refine-acceptance-and-dependencies.md), [03 — Reuse unaffected evidence safely](03-reuse-unaffected-evidence.md).

**Status:** resolved

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

## Answer

Integrated source `449ae0f6fd8e4abb80ec111882b5a644c41ba1e2` plus required privacy correction `1102f814f0d9f99e0aa806e0400951348de6139f` by reviewed fast-forward. The existing read-only CLI now derives compact candidate, integration, claims, output/scenario applicability, capacity, authorization and next-action views. Its bounded current entry validates run/candidate/branch/canonical references. V3/local-v2 permits the actual configured client-only role without inventing a relay checkout; historical v1/v2 behavior remains covered.

The public real-Git walkthrough and compatibility suite passed 71 cases as part of the enabled hook: 81 suites/792 tests and 21 candidate fixtures passed. The populated client-only fixture preserves a selected frozen candidate, linked active claim and correct next ticket; malformed entry human/JSON output excludes the private canary. Both source review axes and affected privacy reviews have no remaining findings. Exact commands/logs and review reports are preserved under primary-root `.local/ux-delivery-recovery/evidence/`, including `ticket-08-source-hook.log`, `ticket-08-privacy-hook.log` and `review-08-{standards,spec}-{449ae0f,1102f81}.md`.

The maintained [migration](../../../docs/agents/ledger/compact-recovery.md) supplies ticket10's adoption procedure. This recovery effort's own current entry and formal local ledger are populated separately from the preservation manifest; original observations, failures and unknown applicability remain explicit. The active UX effort has not been migrated or qualified by this closure. Ticket10 owns its coordinated adoption.

## Actual-summary follow-up

The populated recovery walkthrough exposed a remaining acceptance defect: human `--compact` output is130 lines/48,990 bytes for88 scenarios, repeating full blockers, scenario descriptions and authorization JSON. That is not a concise current summary. Retain the full JSON derived view, but summarize the human view with scenario/output counts, owners, concise blocker/action groups and authorization references. Preserve actionable details via selected ticket and JSON. A public CLI regression must exercise a realistically populated fixture and protect candidate/owner/capacity/authorization/next-action visibility. This reopens only the human-summary requirement; settled pointer, schema, privacy and applicability behavior remains reviewed.

## Human-summary follow-up resolved

Integrated `e56297970f9d4d2d786a56db4dd6ec1b1c7b6536` by reviewed fast-forward. The realistic88-scenario human report is28 lines/3,436 bytes instead of130 lines/48,990 bytes. Full JSON/evaluation remains unchanged; the summary retains full candidate/integration revisions, owners/activity/capacity, per-output scenario counts, grouped blocker/actions and authorization references with scope/detail pointers. Both affected reviews are clear; the hook passed81 suites/793 tests plus36 candidate cases. `ticket-08-summary-populated.txt`, `ticket-08-summary-hook.log` and `review-08-summary-{standards,spec}-e562979.md` retain evidence. The reopened concise-summary requirement is now satisfied.
