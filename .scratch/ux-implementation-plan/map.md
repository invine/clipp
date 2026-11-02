# Clipp UX implementation planning

Labels: wayfinder:map
Status: resolved

## Destination

An implementation-ready specification and dependency-ordered execution backlog for the completed Clipp UX study, covering Electron, Chrome popup/full-page and Android. Preserve the agreed order—correctness and usable controls, compact workspace, then additional controls—with traceability from every finding and approved addition to an owner, implementation boundary and verifiable completion criterion.

## Notes

- Requested in this chat on 2026-10-10: “proceed with implementation planning based on .scratch/ux-study/handoff.md, following the agreed priority order.” The destination is planning. No application implementation, native checks, account activity or release work is authorized by this map.
- The [migration decision](issues/01-choose-migration-sequence.md#answer) settles the small-step strategy, first milestone and transition boundaries. Preserve it when defining the remaining contracts and delivery tickets.
- The [completed UX handoff](../ux-study/handoff.md), [51-finding register and three additions](../ux-study/handoff-findings.md), [layout contract](../ux-study/layout-state-contract.md) and [control-flow contract](../ux-study/control-flow-contract.md) are accepted inputs. The [study map](../ux-study/map.md) remains resolved. Do not reopen its styling, layout, surface-role, reset-consequence, priority or coverage decisions.
- Carry the [exact unverified native cases](../ux-study/remaining-native-coverage.md) into the affected implementation-validation work. Study carryforward is not a test pass or a waiver of future completion criteria. Preserve deferred Google sign-in and prior Android/VoiceOver dispositions; previous clipboard/display intervals are closed.
- Use [Wayfinding operations](../../docs/agents/issue-tracker.md#wayfinding-operations). The numbered child tickets' Status, Assignee and Blocked by fields determine the frontier. This map lists resolved decisions only. Planning dependencies do not prescribe an execution schedule or force every lower-band decision to wait for higher-band implementation.
- Use Wayfinder with grilling and domain-modeling for these decisions. Read source facts before asking questions that can be answered locally. Apply codebase-design when resolving module interfaces; use a prototype only if a specific unsettled implementation interaction needs one. Reuse the accepted visual prototype as design evidence, not production code or native acceptance.
- The [planning source context](source-context.md) records inspected seams, existing owners and validation procedures. At charting, all 145 inventoried source hashes match the study; current client HEAD and pre-existing dirty paths are in [the baseline receipt](planning-baseline.json). Refresh these facts before implementation dispatch and preserve unrelated work.
- Shared behavior belongs in `packages/core`, shared UI in `packages/ui`, and each affected runtime bridge must be wired with its consuming change. Preserve Electron CommonJS/relative-import constraints, extension background/offscreen ownership, empty managed-relay defaults, trusted sender checks and accepted single-session fallback.
- Follow [operations](../../docs/agents/operations.md), [architecture](../../docs/agent-guide.md), [glossary](../../GLOSSARY.md), [domain guidance](../../docs/agents/domain.md) and relevant accepted ADRs. No new domain concept is needed merely to organize screens or planning work.
- Reuse existing extension capture/recapture and managed-relay qualification ownership; the source context identifies those boundaries. External owners block only work that actually requires their result. Do not copy their backlog or silently resolve their decisions.
- The final planning ticket produced the approved [implementation specification](../ux-implementation/spec.md) and [individual execution backlog](../ux-implementation/backlog.md). These planning children are not executable change tickets. Each execution ticket carries outcome, dependencies, source anchors, preserved invariants, affected runtimes, meaningful verification and the disposition of relevant native gaps.
- Future execution follows [coordination and integration](../../docs/agents/workflow.md), including fresh baseline/dirty-state checks, isolated worktrees, coordinator-owned claims, applicable checks and Standards/Spec review. No implementation agents or worktrees are started in this charting session; earlier runs' commit or deployment permissions are not inherited.

## Decisions so far

- [Choose the correctness-first migration sequence](issues/01-choose-migration-sequence.md#answer): small verifiable steps, starting with a focused state/action milestone and Chrome preference integrity; remaining correctness precedes workspace completion.
- [Define shared state, actions and task boundaries](issues/02-define-shared-state-actions-and-task-boundaries.md#answer): runtime-owned ordered state and shared UI sessions; reuse idle Chrome tabs, preserve occupied ones; explicit Save overwrites edited fields without conflict review.
- [Scope correctness and recovery delivery](issues/03-scope-correctness-and-recovery-delivery.md#answer): six focused milestone repairs, then five recovery/management packages, with separate Clear acceptance and explicit native/workspace ownership for shared findings.
- [Plan native host integration and interaction repairs](issues/04-plan-native-host-integration.md#answer): seven host packages, with scanner diagnosis before remedy selection, separate notification qualification, preserved continuity semantics and conditional Dock repair.
- [Plan compact workspace and routine control delivery](issues/05-plan-compact-workspace-and-routine-controls.md#answer): eight packages with early access/theme repairs, compact workspace integration, alias/lifetime controls and functional Chrome parity before retirement; all 51 findings have proposed closure collectors.
- [Design the durable manual identity-reset boundary](issues/06-design-durable-manual-identity-reset.md#answer): one durable transition owner, same-candidate manual recovery and five delivery packages; keep one former-ID reminder until dismissal before another manual reset, without blocking automatic rotation.
- [Finalize validation gates and the implementation backlog](issues/07-finalize-validation-and-implementation-backlog.md#answer): approved the 31-ticket implementation handoff, complete finding/scenario ownership and explicit candidate/external/retained evidence gates; planning complete.

## Not yet specified

None. All seven planning decisions are resolved. The approved implementation specification and execution backlog are the handoff; no planning frontier remains.

## Out of scope

- Implementing fixes, executing destructive operations, running another native study, changing real profiles/accounts/clipboard/display settings, committing, publishing or deploying application changes.
- A new visual redesign, changed Pairing/membership/Clip semantics, new content-script capability policy, concurrent relay sessions or relay-server/operator-console redesign.
- Treating prototypes, fixture coverage or old source receipts as acceptance of a new implementation; claiming exhaustive device or release qualification.
