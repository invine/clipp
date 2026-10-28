# Ticket 01: proposed finite UX allocation

Prepared 2026-10-28 for [ticket 01](../../issues/01-refine-acceptance-and-dependencies.md). This is a preparation slice for the live migration owned by delivery-recovery ticket 10. It changes no UX issue, claim, qualification, product action or authorization. Ticket01 now has reviewed public CLI validation; its canonical Answer owns closure. The proposed live UX migration remains with ticket10.

## Resume and validate

1. Select the primary client root, then its `.local/ux-implementation/worktrees/integration` checkout. Its `.scratch/ux-implementation` directory is the execution authority; the primary planning copy is historical. Compare current source files with [source bindings](source-bindings.json). Observed HEAD was `a46d5f42cf97224955d9c3dccc89665ecb59d5ee`; dirty work is preserved and content hashes distinguish these read observations from HEAD alone. A changed relevant source requires reconciliation before adoption.
2. Read [scenario allocation](scenario-allocation.md) for the remaining criteria, primary owners and evidence boundaries. Use its requirement links against the selected UX execution checkout. Results stay in the existing evidence records; this proposal contains no new passes.
3. Read [graph refinement](graph-refinement.md), then validate the complete [proposed graph](proposed-graph.json) against current numbered tickets. New IDs 37/38 are proposals, remain unclaimed, and must be reserved again at migration. Existing claims stay with their current owners.
4. Use the existing public status command with [v3 scenario allocation](../../../../docs/agents/ledger/scenarios-v3.md), canonical numbered tickets and real-Git checks. Missing scenario owners, missing dependencies and cycles fail; a genuinely verified scoped output can release its consumer while residual qualification remains unresolved. Final qualification still waits for the integrated UI. Proposed owners 37/38 are conservatively unavailable until adoption; no proposal changes the live frontier.
5. Delivery-recovery ticket 10 may then migrate issue scopes/edges, catalog, coverage and traceability together, with the coordinator updating claims and recording applicable review/check evidence. Completion requires no criterion or finding contribution lost and no unqualified runtime enabled.

## Current observations and external blockers

The live UX inventory is 29 resolved, five claimed and two open. Claims remain `10: ux-outcomes-10`, `11: ux-chrome-collector-11`, `16: ux-notifications-16`, `24: ux-settings-24`, `29: ux-reset-runtime-29`; 30/31 are open and unassigned. Ticket 20 is resolved, so its current qualification is a consumed Settings predecessor, not new work allocated here. No elapsed time releases any claim.

The main-first prerequisite is now available: main `7e8d4583c48ea5243209653ff82615182a2f9232` includes the public status CLI, real-Git suites and operational-reliability corrections. The retained claim resumes its remaining public-boundary work without importing another effort's dirty branch. Current operational-reliability policy preserves five attempts and the twenty-minute deadline; historical scoped Android/Chrome/Electron observations retain their original limits and do not qualify UX Pairing, Settings, reset or toolbar-popup journeys.

Reconciliation on 2026-10-28 selected the primary client's explicit `.local/ux-implementation/worktrees/integration` source. HEAD remains `a46d5f42cf97224955d9c3dccc89665ecb59d5ee`; every file hash in [source bindings](source-bindings.json) still matches the current working copy, including its dirty ticket/run content. Existing owners and dirty work remain preserved. Proposed graph IDs 37/38 remain unadopted. This confirms the allocation source binding at that observation, without qualifying any scenario.

All 41 coverage rows G01–G41 retain their current classification and requirement source in the bound live `validation-coverage.md`. The allocation changes only ownership within the remaining Candidate work described here. External/Retained rows and required-if-changed rules remain authoritative: external clipboard baseline/capture ownership; deferred real sign-in/authenticated lifecycle and broad transfer; hardware, OEM/provider, physical display and assistive gaps retain their existing owners/dispositions. No new participation is inferred. A concrete defect or changed requirement is required to add a scenario: record the source, affected scope, owner and why the existing case is insufficient before extending this finite allocation. Incidental preparation findings become readiness blockers or repairs rather than automatic product-matrix additions.

## Acceptance provenance

The following scoped decisions remain administrative records, separate from native observation. Paths below are relative to the selected UX execution checkout's `.scratch/ux-implementation/decisions/` and are content-bound in the manifest.

| Decision                                                        | Preserved scope and limits                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261017-tt35-user-acceptance.md`                              | TT35 accepted with deferred checks; user-reported G01/G14 provenance retained. Collector 11 remains independent; popup retirement is not performed. |
| `20261021-g14-17-19-user-acceptance.md`                         | G14 accepted only for 17–19. Later Settings/reset consumers gain no measured text-scaling pass.                                                     |
| `20261024-chrome-options-fullscreen-search-return-exclusion.md` | Only automatic Search focus after native fullscreen exit in canonical Chrome Options is excluded. Geometry and other input paths remain required.   |
| `20261027-ticket21-user-acceptance.md`                          | Only 21's G13/G15 checks omitted; execution remains unqualified/not run.                                                                            |
| `20261027-ticket22-user-acceptance.md`                          | Only 22's listed Android/live S2 checks omitted; no wider trust/relay or consumer pass.                                                             |

Signed-stateless Pairing, separate Admission and authoritative Membership, remove-wins Device Revocation, one retained Relay Session, durable same-candidate manual recovery and normal clipboard-baseline rules remain unchanged. ADRs 0004/0005/0006/0008/0012 and the approved reset contract govern semantic review. No runtime permission, clipboard interval, account participation or feature activation follows from this proposal.
