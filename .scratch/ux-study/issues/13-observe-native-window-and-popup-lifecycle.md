# Observe native window and popup lifecycle

Type: task
Labels: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Codex (native checks continuation, 2026-10-10)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 06, 07

## Question

What happens in the previously unqualified Electron/Chrome host and restart cases when the actual native hosts, rather than renderer response fixtures, are exercised?

Use fresh isolated study profiles, synthetic data, empty relay configuration and guarded clipboard boundaries. Preserve the original evidence runs in separate directories. Record current source/build/environment receipts and distinguish actual host lifecycle from a mocked app response.

Target actual Chrome popup Escape/click-away without an attached popup debugger, normal/maximized/display-filling fullscreen and restore with settled native bounds, offscreen recreation, actual service-worker stop/wake, full browser close/restart and authoritative visible state. Check identity continuity through public booleans rather than exporting keys or credentials. Observe existing restart/capture issues without duplicating their ownership. Cold offline essential-icon behavior should use real network refusal, not pretend fonts loaded.

For Electron, check actual native window close/reopen/minimize/fullscreen/restore, user-facing tray access where native automation permits, and isolated profile restart/recovery visibility. Notification-to-approval, real Pairing/account/permission journeys are in the separate live-journey ticket; physical display/scaling/assistive checks are in the display ticket. Native OS protection or unavailable UI automation must be reported as a precise remaining limitation, not a pass.

## Comments

2026-10-10: Created and claimed after the user accepted the priority order but required targeted native checks before final study closure. This task supplies missing evidence for the handoff; production fixes remain outside the study. Successful execution may expose UX defects: evidence completion does not require fixing them.

### 2026-10-10 native observation progress — not resolved

The [follow-up report](../native-host-observations.md), [gallery](../native-host-evidence/index.html) and [source/build receipt](../native-host-evidence/source-build-receipt.json) record additional native checks. Both isolated hosts retained identity, one synthetic Clip and Auto Sync false across normal full-process restart. Chrome offscreen recreation, actual forced worker stop/wake and uninspected native Escape were observed. Native maximize/restore/fullscreen measurements now have settled bounds. A real cold-offline popup reproduced E01's icon-name/overlap failure. All 145 source hashes remain unchanged; both owned hosts exited normally.

Keep this task claimed and open: actual native tray selection, uncontaminated close-to-tray background observation, outside-content pointer dismissal, natural worker idle suspension and actual identity/write-failure recovery remain unqualified. The report explains why the native menu click is not outside-content dismissal, why forced stop is not natural idle, and why CUA activation contaminates Electron background observations. Chrome full width is measured, but whole-display pixel coverage is not established. These gaps have not been accepted for carryforward.

Next work should target these remaining cases with an appropriate native input/observation path or a precise human walkthrough, not repeat successful baseline restarts. Do not read operator stores; recovery tests need a fresh disposable profile plus ownership of any automatic relaunch. Real account/Pairing and other-display work remain in their named sibling tasks.

2026-10-10 claim released without resolution while the user's supplied extension folder advances [Observe live Pairing and account journeys](14-observe-live-pairing-and-account-journeys.md). The remaining host cases above stay open and are not waived.

2026-10-10: Reclaimed after user explicitly requested remaining native checks that do not require sign-in. Continue owned isolated host lifecycle and recovery evidence; account sign-in remains deferred.


## Answer

2026-10-10: Completed the bounded non-account native lifecycle investigation. The [continuation report](../native-host-continuation.md) and [evidence notes](../native-host-evidence/continuation/README.md) extend the earlier native results with:

- Native nested-task Escape closes the Chrome popup and loses its relay draft; C12 gains direct evidence. The user separately confirms outside-page click dismissal.
- Passive Electron close-to-tray readings preserve hidden window/Dock state without activation contamination. The user reports Open Clipp reopened the window **and** returned the Dock icon: E17 is not reproduced by this manual route, so it now carries conflicting evidence and needs reproduction before assuming a fix.
- Chrome's worker remains alive for 651 seconds with its offscreen document running. In a separate fresh profile, intentionally closing the offscreen document and detaching inspection allows the worker to stop naturally after 30.005 seconds. Native options navigation then creates a new worker/offscreen document and loads public state. No forced worker-stop command produced that result. Socket timeouts across a long wall-clock gap preclude a precise continuous wake-time claim.
- Real native SQLite writer contention produces the storage error and pending captures. Releasing the lock lets automatic retry persist both submitted synthetic captures and clear the error; identity/Auto Sync remain unchanged. The oversized banner supports E02.
- Actual disposable Identity Loss triggers automatic relaunch, changes identity, clears two synthetic clips, preserves Auto Sync false and displays the correct reset/fresh-Pairing notice. All initial/relaunched test PIDs closed normally.

All 145 source hashes and reused native build artifacts remain unchanged. No personal profile, OS clipboard, sign-in or production source was used or changed. The register retains 51 historical findings with revised evidence confidence.

Resolution closes this bounded host investigation, not the entire native coverage or study. Actual OS clipboard/permission and two-device/notification journeys remain in [Observe live Pairing and account journeys](14-observe-live-pairing-and-account-journeys.md); notice dismissal after relaunch was tool-blocked and is explicitly added there. Other physical displays/scaling/assistive behavior remain in [Qualify desktop display scaling and accessibility](15-qualify-display-scaling-and-accessibility.md). Ordinary offscreen-running suspension was not observed; the conditional natural-stop result is not an authenticated lifecycle pass. No blanket carryforward or final study closure is inferred.
