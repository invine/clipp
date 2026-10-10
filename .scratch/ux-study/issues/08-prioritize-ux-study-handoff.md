# Prioritize the UX findings and handoff

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session)
Parent: [Clipp cross-runtime UX study](../map.md)
Blocked by: 06, 07, 13, 14, 15

## Question

Which evidenced UX findings should be addressed first, and is the assessment complete enough to hand off with no hidden design or coverage decisions?

Review all six user-requested categories across Electron, Chrome popup/options and Android. Group shared causes without erasing runtime-specific impact. Rank by task blockage, data/identity consequences, frequency, affected users and confidence; distinguish observed defects from unverified risks, optional improvements and accepted platform differences. Do not present fabricated severity precision or implementation estimates.

For every retained finding require reproduction/scenario, exact studied source, size/scaling/mode, screenshots or source/bridge proof, actual versus expected result, rationale, recommendation, target ownership (shared UI or runtime), and a verifiable acceptance criterion. Mark unavailable native evidence and seek an explicit scope decision if it would prevent the promised assessment from being considered complete.

Record the user's priority decisions and link the consolidated study artifact. Graduate remaining in-scope fog into precise tickets; only close the map when no study decision remains. Implementation tickets or a build specification belong to a separately authorized follow-up effort.

## Comments

2026-10-09 claim: the user requested the next frontier. Both decision blockers are resolved. Consolidate the runtime findings, accepted design/control contracts and evidence limitations into a reviewable handoff; present the priority order and remaining coverage disposition for the user's decision. Preserve existing approvals and distinguish study completion from runtime or release acceptance.

2026-10-07: [Chrome coverage and remaining gaps](../extension-observations.md#decision-handoff-and-remaining-gaps) distinguish actual POPUP-host evidence from UI response fixtures. Explicitly decide whether native notification/permission journeys, real Pairing/auth handoff, worker restart, other physical displays/OS text scaling, independent popup enlargement and display-filling fullscreen need follow-up qualification before final handoff. Do not silently count them as passed. Reuse existing restart/content-script issue ownership. Current Chrome priorities are provisional; shared keyboard/banner causes overlap Electron findings.

2026-10-09: [Decide visual consistency and efficient layout](07-decide-layout-and-visual-direction.md#answer) is resolved with the [accepted responsive/recovery contract](../layout-state-contract.md). This handoff ticket remains blocked on the controls decision. The former map fog about competing notices/interrupted states is now covered by the layout contract and the existing control-lifecycle questions; the final coverage audit here must still check their treatment across runtimes. Native/display/IME/scaling and other explicitly unrun evidence cases remain coverage-disposition work here. Do not count acceptance criteria or browser prototypes as passed native tests.

2026-10-09: [Decide missing controls and obsolete entry points](06-decide-control-gaps-and-retirements.md#answer) is resolved after the user accepted Q6–Q11 without exceptions. The [approved control-flow contract](../control-flow-contract.md) settles the remaining lifecycle and surface choices, including the qualifications for durable reset recovery, Chrome routing and partial relay-removal failure. Both blockers are resolved. This ticket is now the next unblocked frontier and remains open/unclaimed; priority synthesis and coverage disposition have not been performed by recording that approval.


### Initial final handoff decision round — subsequently answered below

The [consolidated handoff](../handoff.md) and [complete finding register](../handoff-findings.md) retain all 51 runtime findings, three source-supported control additions, all six requested study categories, 23 scenario-family dispositions and the already approved layout/control contracts. Each finding links its precise original reproduction, measurement, actual/expected behavior and evidence, with proposed priority, ownership and acceptance added in the register.

A read-only [source consistency check](../handoff-source-review.json) found all 145 inventory hashes unchanged. Three runtime evidence audits confirmed local report/evidence links and qualified the unrun native cases. No runtime was rerun and no production work was performed. Historical observation proposals remain historical; the accepted contracts control later implementation.

- Q1 — Priority order: recommend correctness/usable controls first, the complete compact workspace next, then additional controls including voluntary identity reset. Bundle small related fixes with their owning work; visual foundations and access are first-band concerns, not deferred polish. Alternatives allow delivering the compact redesign and repairs as one combined priority, or putting new controls first.
- Q2 — Remaining coverage disposition: recommend carrying the explicitly named Electron/Chrome native/display/lifecycle gaps into validation of affected implementation work, allowing this study to finish without claiming those cases passed. Android carryforward is already accepted and is not reopened. Alternatively, require targeted native follow-up before closing the study.

This ticket remains claimed until the user answers the final priority and coverage questions. If accepted, no further study-design question is currently known; implementation planning remains a separate effort. If follow-up is required, graduate the selected coverage work into precise child tickets before closure.


### 2026-10-10 user decision — priorities accepted; native follow-up required

The user selected Q1 “Correctness → compact workspace → additions” and Q2 “Complete targeted native checks before closing.” The priority order is approved. The proposed blanket carryforward of the remaining Electron/Chrome native gaps is not approved; Android's earlier accepted carryforward remains unchanged.

This handoff remains open and is now blocked on [Observe native window and popup lifecycle](13-observe-native-window-and-popup-lifecycle.md), [Observe live Pairing and account journeys](14-observe-live-pairing-and-account-journeys.md), and [Qualify desktop display scaling and accessibility](15-qualify-display-scaling-and-accessibility.md). The first task is claimed for immediate work. Completed observations may establish defects without fixing them; inaccessible prerequisites remain explicit and must be brought back to the user rather than silently waived. Revisit handoff completeness after the targeted evidence is available. Do not re-ask the settled priority question.

2026-10-10 progress: [Native host follow-up observations](../native-host-observations.md) add real restart/lifecycle, settled native window geometry and a cold-offline Chrome failure corroborating the shared icon finding. The host task remains open with precise unqualified cases; account and display prerequisites remain pending. The user supplied public relay setup, and a matching installed extension ID is being prepared. No ticket or map was resolved by this progress update.


2026-10-10 non-account update: [Observe native window and popup lifecycle](13-observe-native-window-and-popup-lifecycle.md#answer) is resolved with the [continuation report](../native-host-continuation.md). Native failure/recovery and conditional natural suspension now have bounded evidence; human tray feedback does not reproduce the earlier Dock result, which is flagged for revalidation. The other live-journey and display/accessibility blockers remain open; Google sign-in remains deferred at the user's request. No final completeness decision has been taken.

2026-10-10 live-journey progress: [Sign-in-free Pairing and clipboard observations](../sign-in-free-journeys.md) qualify real Electron signed request/reject/accept/waiting against a protocol peer, real SQLite approval failure/retry, native notification failure, persistent recovery-notice Dismiss, Chrome QR file import with hidden connection rejection, native Electron text capture and both hosts’ retained-Clip Copy writes. No complete two-native-app Pairing or successful notification selection is claimed. All owned hosts are closed. The live-journey task remains open with exact prerequisites, including focused Chrome read recovery and the deferred account branch; the display/accessibility task remains independently available. Priority and final coverage decisions are unchanged.

2026-10-10 display/accessibility update: [Qualify desktop display scaling and accessibility](15-qualify-display-scaling-and-accessibility.md#answer) is resolved with actual OS scaling, native keyboard/window evidence and exact remaining prerequisites. No external display is available; the user explicitly left VoiceOver unverified. OS text-only scaling, independent popup text enlargement and complete-display Chrome fullscreen remain unqualified and are retained for this final coverage decision. [Report](../display-accessibility-observations.md). The live-journey task remains open; this update does not close the handoff or authorize blanket carryforward.

### 2026-10-10 residual coverage accepted; final handoff unblocked

The user selected “Carry explicit gaps into implementation validation (Recommended)” for the [exact remaining native coverage ledger](../remaining-native-coverage.md). [Observe live Pairing and account journeys](14-observe-live-pairing-and-account-journeys.md#answer) is resolved. All blockers are now resolved; this ticket remains open and unclaimed as the next frontier.

The approved scope carries the precise live-journey and display/accessibility gaps into implementation validation as **unverified**, after the targeted observations. Preserve their owners and prerequisites. Deferred sign-in, accepted Android/VoiceOver dispositions and correctness → compact workspace → additions remain unchanged. Do not re-ask these settled choices. Finalize the consolidated handoff and check that no study decision remains before closing this ticket and the map; implementation and release qualification remain outside this study.

### 2026-10-10 final synthesis claim

Claimed at the user's request to proceed with the next frontier. Validate the consolidated register, accepted contracts and residual coverage references; resolve this handoff and close the map if no study decision remains. Existing priority and coverage approvals supply the human decisions; do not repeat those questions or launch further native checks by inference.

## Answer

Resolved 2026-10-10. The [completed handoff](../handoff.md) and [finding register](../handoff-findings.md) retain **51 distinct runtime findings** (17 Electron, 16 Chrome, 18 Android) plus three separately evidenced control additions. All six requested study areas and 23 scenario families have an explicit treatment. Each runtime finding links its canonical reproduction, measured surface/size/scaling, actual versus expected result, evidence and confidence, and has a priority band, proposed owner and verifiable acceptance criterion.

The user's approved sequence is **correctness and usable controls → compact workspace → additional controls**. Shared styling with adapted layouts, compact narrow rows/equal-height wide cards, branding above Search, icon actions, M1 Devices with text statuses, M3 Settings and the S2 header indicator remain settled. The [layout contract](../layout-state-contract.md) and [control-flow contract](../control-flow-contract.md) govern implementation, including Chrome surface allocation and the advanced identity-reset lifecycle. No new product or domain decision was introduced during synthesis.

After the requested targeted native observations, the user explicitly accepted the [exact residual coverage](../remaining-native-coverage.md) as unverified implementation-validation work. Preserve its prerequisites and owners, deferred account sign-in, accepted Android/VoiceOver dispositions and existing extension capability issues. Actual native observations, public-state/response fixtures, prototype behavior and future acceptance criteria remain separate evidence classes. The manual tray result did not reproduce the earlier Dock finding; the handoff requires revalidation before assuming a fix.

The final read-only consistency audit found no unresolved design or coverage decision. Document validation checks linked files/anchors, all runtime finding IDs and source hashes; see [final validation](../handoff-final-validation.json). No app was launched, production code changed, implementation ticket created, commit made or service deployed in this final round. Previously owned hosts remain closed, native clipboard intervals are finished and the display was restored by the recorded native-check closure.

The study's destination is reached. Close the map with no remaining frontier or in-scope fog. Implementation planning and release qualification are separate follow-up work, using this handoff rather than reopening accepted study decisions.
