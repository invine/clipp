# Plan native host integration and interaction repairs

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session)
Parent: [Clipp UX implementation planning](../map.md)
Blocked by: 02

## Question

What native/runtime work must accompany the shared task contract so controls remain reachable and functional, and how should it be separated from ordinary UI changes?

Plan Android actual insets, IME/rotation, layered Back, scanner/provider safety and media cleanup, notification-permission recovery, notification-to-Requests routing, diagnostics containment, touch targets and enlarged text. Separate the observed provider crash from its unproven prevalence or root cause; include an explicit diagnostic result before choosing a provider remedy. CSS or catching a JavaScript exception does not establish native safety.

Plan Electron/Chrome keyboard/focus and native destination behavior with the shared task owner. Include the approved Android state-dependent Pause/Resume treatment and the distinct Stop background mode behavior. Remove the duplicate Configure Relays command in its proper priority band. Revalidate Dock return before scheduling a definite repair, preserving the later manual non-reproduction.

Use the [native evidence and gaps](../../ux-study/remaining-native-coverage.md), [Android findings](../../ux-study/handoff-findings.md#android), and [source boundaries](../source-context.md). Assign responsibility for host signals versus shared UI reactions, native acceptance, safe test prerequisites and follow-up ownership. Account, hardware, clipboard and global-setting limits remain intact; this planning decision does not run native checks or infer renewed user participation.

Resolution should yield proposed native work packages, dependencies supplied to workspace planning, diagnostic versus implementation boundaries and required native evidence. Unavailable external qualification must not become a pass or block unrelated frontend work.

## Comments

Claimed 2026-10-10 as the next frontier at the user's request. Plan host integration and native acceptance around the approved shared interfaces and correctness delivery. Preserve existing product decisions, deferred sign-in and accepted coverage gaps. This decision performs no implementation or native testing and does not reopen prior clipboard/display coordination intervals.

The [native host delivery proposal](../native-host-delivery-proposal.md) defines seven reviewable packages, their shared consumers, finding ownership and native acceptance profiles. Provider diagnosis precedes remedy selection; scanner lifecycle work can proceed independently. Notification callback wiring is distinct from actual OS delivery/selection. Android continuity must publish authoritative Auto Sync rather than infer it from connection status. Tray cleanup keeps its existing priority, with any Dock repair conditional on actual menu-route revalidation.

Read-only Android and Electron/Chrome source investigations support these boundaries. Permission availability remains channel-specific on Android, and continuity's reconnect notification retains its own destination. No new product vocabulary or ADR is needed. The proposal remains pending the user's package-boundary decision.

Two read-only proposal audits found no remaining blocker after clarifying C04's existing issue-composition owner and notification selection versus arrival. The accepted Electron/Android Requests transition retains the originating task/draft and pending operation; Chrome alone uses the idle/occupied-tab rule. Validation checked local links and anchors and confirmed all 145 inventoried sources, study inputs and pre-existing tracked changes remain unchanged. The user is asked only to settle this native package breakdown; product behavior and coverage dispositions are not reopened.

## Answer

Resolved 2026-10-10 after the user selected **“Adopt the native delivery breakdown (Recommended)”**. Adopt the [native host delivery breakdown](../native-host-delivery-proposal.md), including its seven package scopes, dependency outputs, finding ownership and native acceptance profiles, for final execution-ticket consolidation.

The packages cover Android content bounds/IME; native task input/focus; scanner-provider diagnosis; scanner safety/lifecycle; notifications and permission recovery; Android continuity controls; and desktop tray/window behavior. Provider diagnosis produces evidence before remedy selection; independent lifecycle work can proceed earlier. Notification permission/routing tests remain distinct from real OS delivery and selection qualification. Android continuity carries authoritative Auto Sync and preserves its separation from Stop background mode.

Existing priorities remain: safe geometry/input/scanning/recovery in correctness; compact continuity and pending presentation in their workspace band; tray cleanup and any reproduced Dock repair in band 3. Actual tray-route revalidation decides whether a Dock change is needed. Shared task, issue, navigation and Chrome handoff owners remain authoritative; host work does not duplicate them or close their findings after only partial evidence.

The approved UX and exact native coverage dispositions remain unchanged. Unrun cases stay unverified; account, clipboard, display and device test prerequisites are preserved. This decision resolves planning, not native defects or implementation/release qualification, and starts no runtime activity.

No new decision ticket emerged. [Plan compact workspace and routine control delivery](05-plan-compact-workspace-and-routine-controls.md) is now unblocked and is the next frontier by order. [Design the durable manual identity-reset boundary](06-design-durable-manual-identity-reset.md) remains independently unblocked. Neither is claimed by this resolution.
