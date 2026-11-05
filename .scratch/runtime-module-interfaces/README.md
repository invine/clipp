# Runtime module interfaces

**Owning repository:** client (Clipp)  
**Canonical feature directory:** client:`.scratch/runtime-module-interfaces/`  
**Specification:** [spec.md](spec.md)  
**Decisions and coverage:** [decisions.md](decisions.md)

Clipp owns the production adapter, shared runtime, and test changes described here. This effort is client-only.

The specification and ten approved tickets were published locally. Implementation is complete on the local integration branch; it has not been pushed or published remotely.

## Approved tickets

| Ticket | Deliverable                                                                                                             | Blocked by                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 01     | [Stabilize Electron workspace snapshots](issues/01-stabilize-electron-workspace-snapshots.md)                           | UI behavior reaching `main` (external)                                                                        |
| 02     | [Verify Chrome workspace snapshots](issues/02-verify-chrome-workspace-snapshots.md)                                     | [01](issues/01-stabilize-electron-workspace-snapshots.md)                                                     |
| 03     | [Verify Capacitor workspace snapshots](issues/03-verify-capacitor-workspace-snapshots.md)                               | [01](issues/01-stabilize-electron-workspace-snapshots.md)                                                     |
| 04     | [Retire stale notification results](issues/04-retire-stale-notification-results.md)                                     | [02](issues/02-verify-chrome-workspace-snapshots.md), [03](issues/03-verify-capacitor-workspace-snapshots.md) |
| 05     | [Give Auto Sync one durable authority](issues/05-give-auto-sync-one-durable-authority.md)                               | None                                                                                                          |
| 06     | [Activate Clip exchange when transport is ready](issues/06-activate-clip-exchange-when-transport-is-ready.md)           | None                                                                                                          |
| 07     | [Preserve pending Share Now across transport replacement](issues/07-preserve-share-now-across-transport-replacement.md) | [06](issues/06-activate-clip-exchange-when-transport-is-ready.md)                                             |
| 08     | [Keep a stopped runtime stopped](issues/08-keep-a-stopped-runtime-stopped.md)                                           | None                                                                                                          |
| 09     | [Confirm Device Identity retirement before cleanup](issues/09-confirm-device-identity-retirement-before-cleanup.md)     | [08](issues/08-keep-a-stopped-runtime-stopped.md)                                                             |
| 10     | [Share Pairing rejection cleanup](issues/10-share-pairing-rejection-cleanup.md)                                         | None                                                                                                          |

**External prerequisite for 01 (satisfied).** Before dispatch, the exact UI behavior source `codex/ui-behavior-integration` at `2957bfa30be2ce809f87be9f61393cae43a3826f` was verified as an ancestor of local `main`, and the integration branch was fast-forwarded to that `main` tip. Tickets 02–04 then followed their recorded dependencies.

## Integration lineage

- Integration branch is codex/runtime-module-interfaces-integration.
- Local main at worktree creation was cbfa8887c9f54778c9820f41f4c83460d33b0173.
- The architecture evidence comes from codex/ui-behavior-integration at 2957bfa30be2ce809f87be9f61393cae43a3826f.
- R1, R2, and R7 depend on the UI behavior effort's production adapter and workspace work. The prerequisite had yet to reach local main at specification publication. Recheck ancestry and prerequisite source before future dispatch.

[Local tracker conventions](../../docs/agents/issue-tracker.md) · [Spec worktree workflow](../../docs/agents/workflow.md#spec-worktrees-and-branch-lineage)
