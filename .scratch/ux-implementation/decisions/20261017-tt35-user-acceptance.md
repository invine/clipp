# TT35 acceptance and deferred qualification — 2026-10-17

Status: accepted by direct user instruction
Scope: ticket 35 only, its implemented Chrome management/handoff/task-input output and outstanding acceptance checks

## Decision evidence

After asking what blocks35 and receiving its remaining native checks and exact manual launch commands, the user first directed “record G1 and G14 passed” and then directed “consider all passed, we'll figure it out later.” The latter instruction accepts the current TT35 deliverable and defers its remaining qualification. It supersedes the earlier requirement to keep35 claimed until every native matrix is executed. No further approval is required.

## Recorded outcome

Resolve 35 by user acceptance of the integrated implementation. For administrative acceptance its remaining checks are considered passed by the user. For execution evidence, retain the actual result of every case: agent-observed passes remain scoped to their original candidate, failures remain failures, and checks not run remain not run/deferred. The instruction does not establish new measurements or a new native test execution. G01/G14 retain the separately recorded user-reported PASS provenance.

The reviewed production source is61e3de332a76536a288bb812a7623328357dd727, tree f40c1626b5e43bcf475f63c2632ed9d0d37682ef, integrated on codex/ux-implementation-integration. Fresh root verify already passed 152 suites/1,134 tests, all typechecks/all three production builds, lint 0 errors / 887 warnings. Subsequent commits are coordinator documentation only. Source review, native failure/repair and cleanup receipts remain in the ignored run directory. This decision introduces no source change or new passing test claim.

## Deferred follow-up

Outstanding routing/fault/worker/concurrent-view cases, complete task/action/error/layout/theme matrices and cutover execution may be investigated later. Popup management remains present; this acceptance record does not perform retirement. Preserve prior native failures, unavailable peer/host details, unrun cases, candidate bindings and existing deferrals for future investigation.

This acceptance exception applies to 35. It does not mark all project tickets, finding collectors, notification/native transport qualification or broader Android/Electron coverage complete. Original collector 11 and other consumers retain their own scope. Source behavior, transport/security policy, ADR0012, real sign-in deferral and operator profiles are unchanged.
