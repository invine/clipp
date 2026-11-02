# Qualify desktop display scaling and accessibility

Type: task
Labels: wayfinder:task
Mode: HITL
Status: resolved
Assignee: Codex
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 06, 07

## Question

Which previously unqualified Electron/Chrome physical display, scaling and assistive-input cases can be established natively, and what exact access is needed for the remainder?

Inventory connected displays and available native facilities using read-only tools first. Target an additional work area, native 1×/non-Retina and 1920-wide physical coverage where available, actual OS display/text scaling, enlarged popup UI independently of tab zoom, and native keyboard/assistive navigation. Preserve physical/native/CSS dimensions and scale provenance. Check full-content field/identifier inspection and relevant name-boundary errors alongside the selected input paths.

Do not substitute Playwright viewport/DPR emulation, root-font changes, a restored 1920px window on a smaller display, or options tab zoom for physical display/OS/popup coverage. Do not change the user's global display or accessibility preferences without a reversible, user-coordinated test interval. Lack of a connected device or access is a factual prerequisite, not a failed UX test. Prepare the exact human-only steps and affected cases if needed; do not request another broad study approval.

Use new evidence directories and isolated app profiles. Android's physical/OEM/IME/TalkBack/foldable gaps remain under the earlier accepted carryforward; this ticket does not reopen them. Record coverage gained and exact unresolved prerequisites before the handoff is reconsidered.

## Comments

2026-10-10: Created after the user declined automatic carryforward of the desktop/Chrome native gaps. This is a bounded evidence task, not a requirement to buy hardware or establish exhaustive accessibility conformance.

2026-10-10 prerequisite inventory: the [native Electron environment receipt](../native-host-evidence/electron/environment.json) found one built-in Retina display, 1512×982 logical units, scale factor 2, 1512×949 work area. The [host follow-up](../native-host-observations.md#native-window-sizes) measures native maximize/restore/fullscreen on that display. No additional physical work area, 1× display or OS scaling was exercised; no global accessibility/display preference was changed. Other-display availability and a reversible OS-scaling/assistive test interval remain specific prerequisites for this task.


2026-10-10 claim: the user requested the next frontier after the closed clipboard interval. Continue the independent display/accessibility task; the earlier live-journey task retains its recorded prerequisites and is not resolved or waived. Inventory native facilities, preserve global preferences and personal clipboard, and use fresh isolated hosts for native keyboard, field-boundary and popup scaling observations.

## Answer

The [native display/accessibility report](../display-accessibility-observations.md) establishes which cases this host can qualify and records the unavailable prerequisites. Actual OS display settings 1024×665 and 1800×1169 were applied through native System Settings after explicit user approval, with Electron maximize/fullscreen/restore and Chrome options/popup measurements. The original 1512×982, scale 2 display is verified restored. Both isolated hosts closed normally; clipboard access stayed memory-only. [Evidence/replay notes](../display-accessibility-evidence/native/README.md), [closure](../display-accessibility-evidence/native/closure-receipt.json).

Native Tab confirms the inaccessible compact management entry in Electron and Chrome (E06/C06); native QR Tab reaches obscured background controls and Escape fails (E06). Real 65-character name rejection discards the draft silently (E11). Valid 64-character ASCII and 64-emoji names save, but the narrow emoji preview splits a surrogate and displays a replacement glyph (E16). The shorter native Chrome popup measures 495×559 and its final Auto Sync preference remains reachable. These are new evidence/cases for existing findings, not production fixes or a new finding count.

The user reports no external display, and explicitly selected VoiceOver as an unverified gap. External/native 1×/physical 1920-wide coverage, OS text-only scaling, independently enlarged popup text, complete-display Chrome fullscreen and comprehensive remaining name/assistive paths retain the precise prerequisites in the report. The disposable Chrome font preference reached 32 but a stable popup capture failed at the UI-tool boundary; this is not a typography pass or app defect. Hardware absence does not itself waive final coverage. This bounded investigation is resolved; [Prioritize the UX findings and handoff](08-prioritize-ux-study-handoff.md) retains the final coverage decision, and the separate live-journey task remains open.
