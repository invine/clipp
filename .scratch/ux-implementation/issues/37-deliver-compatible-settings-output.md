# Deliver compatible Settings composition for reset UI

Type: implementation
**Status:** ready-for-agent
Assignee: none
Priority band: 2
**Blocked by:** [07](07-preserve-session-tasks-and-editor-recovery.md), [35](35-deliver-chrome-management-and-task-input.md), [17](17-unify-local-assets-and-shared-controls.md), [18](18-implement-persisted-themes.md), [19](19-deliver-accessible-navigation-and-reflow.md), [20](20-wire-retention-and-sharing-lifetime.md), [25](25-repair-android-continuity-controls.md)
Dispatch: adopted scope; coordinator must save a fresh eligible claim before assignment
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Deliver compatible M3 Settings composition S24.1–S24.3 so reset UI can consume working existing tasks; native Settings qualification remains24.

## Work and boundaries

Compose General/Connections/Advanced with actual existing theme, Auto Sync, retention/lifetime, continuity, relay and Clear actions. Preserve deliberately expanded relay details, full long-value access, draft/editor retention, existing login/portal/remove semantics, truthful applied/partial/rejected results and empty relay defaults. Reserve Generate new identity behind runtime availability until its entire qualified path exists. No dead controls or sign-out/account-switch addition.

## Dependencies and integration

- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Deliver complete Chrome management, secure handoff and task input](35-deliver-chrome-management-and-task-input.md) — consume its completed, scoped output.
- [Qualify desktop shared controls and collect cross-surface styling](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.
- [Implement persisted System, Light and Dark](18-implement-persisted-themes.md) — consume its completed, scoped output.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.
- [Wire local retention and Clip Sharing Lifetime](20-wire-retention-and-sharing-lifetime.md) — consume its completed, scoped output.
- [Repair Android continuity controls](25-repair-android-continuity-controls.md) — consume its completed, scoped output.

Only the output scoped here must be complete. Native collectors keep their own criteria; a proposed allocation, source fixture or unavailable runtime cannot supply their observation. Follow [phase admission](../spec.md#delivery-order-and-completion).

## Verification and acceptance

- S24.1: working categories and existing settings/management actions, concise continuity, Clear and unavailable reset placement.
- S24.2: actual write/result/error/Retry behavior, partial effects, retained editor through category/resize and full endpoint access.
- S24.3: reuse completed Chrome management/handoff; expose reset availability/status contract without enabling action.

Use [finite candidate preparation and affected gates](../adoption.md#candidate-preparation-and-qualification), owning public interfaces and the [complete allocation](../scenario-allocation.md). Record source/build/actual outcomes and both reviews; routine checks qualify source only.

## Coverage and closure

Supporting contributor to24 E14/C14/A05/A16 and26 E10 reachability; their primary finding ownership is unchanged. Source/interface completion does not qualify changed native Settings presentation.

## Handoff

Coordinator records claim, exact baseline, isolated worktree, integration mapping, verification/reviews and residual native cases before resolution. No current claim, result, action activation or new permission is created by this file.
