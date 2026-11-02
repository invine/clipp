# Deliver M1 Devices, Requests and alias clearing

Type: implementation
**Status:** resolved
Assignee: ux-devices-23
Priority band: 2
**Blocked by:** [04](04-retain-name-and-alias-edits.md), [05](05-report-immediate-pairing-results.md), [07](07-preserve-session-tasks-and-editor-recovery.md), [33](33-deliver-pairing-outcome-interface-and-electron-journey.md), [35](35-deliver-chrome-management-and-task-input.md), [17](17-unify-local-assets-and-shared-controls.md), [18](18-implement-persisted-themes.md), [19](19-deliver-accessible-navigation-and-reflow.md), [21](21-deliver-compact-history-and-details.md), [22](22-present-s2-connection-summary.md)
Dispatch: authorized UX implementation run `ux-implementation-20261027`; claim recorded in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

M1 Devices gives compact trusted-device summaries, reachable Requests and alias clearing.

## Work and boundaries

Keep Device statuses as text; show full names/IDs on demand and pending access without long traversal. Use device name clears only the local alias via existing capability and corrected saves. Preserve Pairing/approval and existing Revoke action/review while reorganizing.

Trusted is not connected; no guessed device platform. Alias clear does not alter identity/name. Revoke remains permanent remove-wins membership behavior; manual reset does not revoke the old identity.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#m1-devices-requests-and-alias-clearing) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Retain Device Name and alias edits](04-retain-name-and-alias-edits.md) — consume its completed, scoped output.
- [Report immediate Pairing and approval results](05-report-immediate-pairing-results.md) — consume its completed, scoped output.
- [Preserve session tasks and editor recovery](07-preserve-session-tasks-and-editor-recovery.md) — consume its completed, scoped output.
- [Deliver the compatible Pairing outcome interface and Electron journey](33-deliver-pairing-outcome-interface-and-electron-journey.md) — consume its completed, scoped output.
- [Deliver complete Chrome management, secure handoff and task input](35-deliver-chrome-management-and-task-input.md) — consume its completed, scoped output.
- [Unify local assets and shared controls](17-unify-local-assets-and-shared-controls.md) — consume its completed, scoped output.
- [Implement persisted System, Light and Dark](18-implement-persisted-themes.md) — consume its completed, scoped output.
- [Deliver accessible navigation and task reflow](19-deliver-accessible-navigation-and-reflow.md) — consume its completed, scoped output.
- [Deliver compact History and full details](21-deliver-compact-history-and-details.md) — consume its completed, scoped output.
- [Present the S2 connection summary](22-present-s2-connection-summary.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test dense devices/requests, complete values and Copy, alias-clear rejection, stale request, approval/version failure and notification entry. Preserve Revoke Cancel/confirm, failure/Retry and live state. Collect S2/preview/notification evidence for E12/E16 without making earlier packages wait on this screen.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate control/alias/revocation UI; native notifications required for claimed selection route. Real revocation convergence remains named qualification.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E12, E16 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [identity.ts](../../../packages/core/trust/identity.ts)
- [pending.ts](../../../packages/core/pairing/pending.ts)
- [reconciliation.ts](../../../packages/core/membership/reconciliation.ts)
- [presentation.test.ts](../../../tests/core/pairing/presentation.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Before the authorized dispatch below, no code or native operation had occurred for this ticket. The dispatch and resolution below supersede this planning handoff; no push, PR, publication or deployment was performed.

## Dispatch — 2026-10-27

Coordinator claim `ux-devices-23`; client integration branch `codex/ux-implementation-integration`, baseline `1735ee206f58ebe62e6ac580e27a2f16a3feea19`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-23`, source dirty-state SHA-256 `604b7d796d199d970bd6719ed34205fc44d0ebe0aae7d53abc394d780d6a82c7` preserved in the integration worktree. Predecessors 04/05/07/33/35/17/18/19/21/22 are resolved. The user's explicit scoped decisions for 21/22 satisfy those dependency statuses while their unqualified gates remain recorded and are not inherited as passes.

Decision assessment: implement the accepted M1 Devices/Requests presentation and existing local-alias clear operation. Preserve ordered authoritative state, stale-target protection, approved Pairing and remove-wins Revoke semantics, visible truthful device connection text, explicit Save behavior and UI session/task/focus continuity. No protocol, identity, membership or platform-guessing changes. The ticket and approved workspace contract identify the public presentation/action seam (`ClipboardApp` plus existing core identity/pairing APIs and runtime bridges); use those as the pre-agreed TDD seams. Required native notification selection remains unqualified and owned separately.

## Integrated implementation and verification — 2026-10-27

Coordinator resolution: the scoped M1 Devices/Requests and local alias-clear UI is implemented and integrated. The shared Devices screen labels This device and Trusted Devices, exposes full Device Name and Peer ID inspection/copy, and offers Use device name through the existing empty-alias operation. Failures preserve the editor draft; a late clear does not overwrite newer typing. Existing connection status, approval, and Revoke action semantics remain in the shared consumer. No runtime bridge or protocol change was needed.

Integration: `codex/ux-implementation-integration`, baseline `1735ee206f58ebe62e6ac580e27a2f16a3feea19`, result `ddff12a485c943e382378710428e51e6db484b96`, tree `29c0a339b9d5fbb187d692fb8133d539f4e14d04`. Ticket branch `codex/ux-23-devices` was fast-forwarded with 1:1 commit mapping through `96e420a78d668437a2a858c4d032fc54d826711e`; final harness-only selector corrections at `ddff12a485c943e382378710428e51e6db484b96` were also fast-forwarded. Source implementation is in `d7bdccefbc4570b075eb7a4bf25cbfef35abfbeb`; subsequent commits add rendered acceptance coverage. The integration worktree's pre-existing unrelated dirty changes were preserved.

Verification: on candidate source commit `7bfe0bccbda66716e6db9aaaa1221074cc3b2259`, `npm run verify` passed on Node v26.12.1/npm 11.20.0: lint 0 errors (935 existing warnings), all shared/Electron/Android/extension typechecks, Jest 178/178 suites and 1,365/1,365 tests, and Electron, Android web, and extension production builds. On final integrated HEAD `ddff12a485c943e382378710428e51e6db484b96`, `node tests/harness/devices-requests.mjs /private/tmp/clipp-ux23-final-integrated-20261027` passed with host Chromium and `git diff --check` passed. The rendered harness covers zero/one/20 devices, zero/one/four requests, dense-list reachability, valid NFC Unicode shared-prefix names and full-value copy, direct/relay/offline/unknown statuses, display-failure guidance with Requests still reachable, stale-version approval feedback/list reconciliation, alias-clear failure/success/newer typing, and Revoke cancel/failure/Retry with fixture row removal. Formatting and JavaScript syntax checks passed on the ticket branch.

Review: Standards and Spec reviews both pass on the final branch through `ddff12a485c943e382378710428e51e6db484b96` (`ticket23_review_standards`, `ticket23_review_spec`); no actionable findings remain.

Scope limits: native OS notification delivery/selection and real Membership revocation convergence are not claimed by these rendered fixtures. Per-host notification selection remains with ticket16, and real network convergence remains the separate retained qualification. Broader E12/E16 finding closure is not inferred. Ticket23 is resolved for its scoped M1 UI output; these separate qualifications stay unqualified.

## Pairing scope refinement — 2026-10-12

Consume ticket 33's completed common interface and scoped Electron evidence. Residual ticket 10 retains required Android/Chrome native journeys. This consumer retains every affected host/native/cutover qualification; Electron G01 is not a cross-runtime pass.

## Host delivery allocation — DRAFT 2026-10-14

Proposed under the approved cross-runtime refinement and existing-task/functional-management integration boundaries.34 supplies Android/Electron generic native input against resolved07/12/32;35 co-delivers complete Chrome management and Chrome13 input against resolved02/03/06/07/08/32/33. Original13/11 remain collectors;17/19/15/16/10 keep every residual desktop/navigation/scanner/notification/Pairing gate and contribution. Each consumer retains its own affected presentation/native/cutover gates. Consume genuinely completed scoped outputs only; no source-only resolution or finding closure. Root must accept and apply the full allocation before any new claim.
