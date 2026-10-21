# Implement persisted System, Light and Dark

Type: implementation
Status: claimed
Assignee: ux-themes-18
Priority band: 1
Blocked by: 01, 32
Dispatch: authorized UX implementation run `ux-implementation-20261010`; isolated claim below
Parent: [Clipp UX implementation](../spec.md)

## Outcome

System, Light and Dark work consistently, update live and persist per installation.

## Work and boundaries

Add validated theme preference through existing authority, every bridge and host background. System is unset/default and follows appearance; explicit modes remain explicit. Include task portals and initial root rendering without another browser-local preference.

Theme is installation-local, not device synchronization. Failed writes remain unsaved; System appearance changes do not rewrite the preference.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#persisted-system-light-and-dark) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.
- [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md) — consume its completed compatible asset/control interface and Android control contribution.

The refined prerequisite supplies compatible source and its qualified Android scope. [Residual desktop controls](17-unify-local-assets-and-shared-controls.md) keep their missing G13/G14 qualification. This consumer still requires every affected desktop/native presentation gate in its own accepted scope; source compatibility is not desktop qualification.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test modes, live System change, invalid persisted values, overlapping views, failure/unconfirmed writes and reopen. Inspect real computed/visible field/text/action/focus contrast and offline launch, not class names alone.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate theme/native appearance; relevant OS text/display and hardware gaps remain separately recorded.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: E13, C05 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [styles.css](../../../packages/ui/src/styles.css)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [main.ts](../../../apps/electron/src/main.ts)
- [main.tsx](../../../apps/android/src/main.tsx)
- [popup.tsx](../../../apps/extension/src/popup.tsx)
- [options.tsx](../../../apps/extension/src/options.tsx)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Dispatch assessment — 2026-10-11

Predecessors 01 and 32 are resolved; this is the next eligible band 1 feature while 08/10 and residual 17 complete their native gates. Preserve the approved installation-local preference, existing settings authority and ordered current-session feed. System is unset/default, explicit modes stay explicit, host appearance changes are presentation updates rather than preference writes, and failed/unconfirmed writes remain truthful. No device synchronization, credential/key storage migration, additional product store, account action, or ADR-0012 transport/default-relay change is assigned. No accepted invariant changes.

Coordinator claim `ux-themes-18`: client branch `codex/ux-18-themes`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-18`, based on this doc-only claim commit atop reviewed integration `15dbb96f9eb0cb02bb560cc895ef73c55282adeb`. Use the normative workspace theme package and shared interface, core authority/shared UI, and every affected live runtime bridge/background. Use TDD through owning preference and real consumers; no tests tied only to class names or stored JSON.

The completed source 17 repair at `15dbb96f` / `d11c811c` restores narrow/short outer scrolling and the public workspace scroll owner; both code axes and integrated 112 suite / 836 test / all three build gate pass. Actual changed-consumer G13 and G14 remain unqualified and are not consumed as passes. Source 10 is integrated/source-reviewed; actual complete app-to-app G01 remains required and unrun. Their frozen native candidate is this claim tip, with unchanged `15dbb96f` production assets. Implement only in the isolated theme worktree; do not integrate theme changes or mutate frozen acceptance assets until the coordinator releases that boundary.

At most two active implementers: existing 08 acceptance preparation and themes 18. Root serializes native/renderer and broad timer-sensitive gates. No host clipboard or global setting interval is open. Prepare actual native appearance, concurrent views, cold offline and affected text/control evidence for later fresh assignment; any global appearance/text change requires its applicable authorization. Real sign-in, external-owner, hardware/assistive and all other recorded deferrals remain unchanged.

## Reviewed source integration — 2026-10-12

Mandatory merger integrated reviewed source `c38a3426c40f1b8cc39308b3391f4b58ba2a1c17` at `4d8cb331c9ec52f36e3ea2990d5daa097da32655`; the complete tree is exactly `b75f9bb27c93fa6fbb7a6cc0d5353b3850f5269f` on both. Final Standards and Spec reviews pass. Fresh integrated `npm run verify` passes 117 suites/849 tests, all four project typechecks and three production builds, zero lint errors. Source/build hashes and 60 equal production runtime assets are mapped; the internal extension manifest's intermediate chunk metadata difference is retained and explained.

The source includes persisted authoritative Appearance, the Android common settings-owner race repair and Electron missing/restored-bridge recovery. Handoff/receipt: `ticket-18-integration-merge-handoff.md` and `ticket-18-integration-merge-receipt.json` in the ignored run evidence directory. Required native G13/G14/G36/G38 remain unqualified; older frozen popup evidence does not qualify this changed presentation. Ticket 18 stays claimed.

## Current Chrome supporting observation — 2026-10-16

The b415 production full-page native Chrome check selected Dark through the actual Appearance dropdown, observed the saved result and visibly dark page, then selected System and observed System/saved. It did not qualify persistence across native restart, live OS appearance changes, concurrent views, all-mode field/action/focus contrast or the complete affected host/control matrix. Evidence: ignored run `ticket35-native-fullpage-b415/observations.json` and `ticket35-native-partial-audit.md`. This supports one current Chrome consumer only;18 remains claimed and all required native gates/deferrals remain.

## Disposed theme settings owner repaired — 2026-10-17

Source `080d71d123d4ab259cacd6b1ca48d187e3919fdf` repairs the reproduced late theme-save reply that could resubscribe after settings-client stop. Owner-generation and refresh fences retire old replies, bootstrap work and subscription events without overwriting a restarted owner's current save. Explicit start/refresh reuse remains supported; uncertain retired writes stay unconfirmed. Only the shared settings client and its existing owning recovery tests change. Four regressions cover retired applied/lost replies and events, stopped bootstrap and legitimate restart.

The author incorporated current29 source before final check/commit. Focused 8 suites/48 tests, authorcheck and actual unchanged sanitized hook pass; final full count is152 suites/1,149 tests. Missing generated ignored hook files were copied from integration only where absent, with identical sanitized wrapper/tracked-hook hashes and unchanged configuration. Mandatory fast-forward integration, independent Standards0/Spec0 and fresh root verify on the same080d71d tree pass all typechecks/all three production builds, lint0errors896warnings. Exact ignored evidence: `theme18-remaining-source-handoff-20261017.json`, both `source18-29-*-merge-20261017.json` receipts and `source18-29-integrated-verification-20261017.json`. Original RED and Git metadata permission failures remain preserved.

18 remains claimed for actual theme/appearance/persistence/contrast/offline and affected native/control qualification. These source tests do not supply new native evidence. TT35's explicit acceptance remains unchanged and is not broadened to other tickets. No new harness/preparation, native/OS/clipboard/account/operator/relay operation, repeated approval request or popup retirement.

## G14 completion by user acceptance — 2026-10-21

The user directs “Mark these gates completed” for desktop OS text-only scaling G14 on17–19. [Accepted decision](../decisions/20261021-g14-17-19-user-acceptance.md) completes this ticket’s G14 gate administratively; no new native run or enlargement measurement is asserted. Earlier failed/unavailable/unchanged-text observations remain intact. Every other candidate gate and finding contribution remains required; this decision alone does not resolve the ticket.
