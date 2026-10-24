# Chrome Options fullscreen Search return exclusion — 2026-10-24

Status: accepted by direct user instruction
Scope: only automatic Search focus return after actual native fullscreen exit in canonical Chrome Options

## Decision evidence

After the fresh a313 Chrome Options trial, the user replied: “still doesn't work. can we exclude this test case and not require it?” The reply answered coordinator question `call_e4479d3be6a844749dec8761a79a693d` for Search containing the public synthetic text, one native fullscreen enter/exit cycle and subsequent typing. The coordinator accepted only this named automatic Search-focus-return test case. The instruction and acceptance occurred in the coordinator conversation on 2026-10-24; no approval is inferred from elapsed time or a fixture.

## Accepted scope and retained limitation

Exclude the requirement that Search automatically regain native typing focus after actual fullscreen exit in canonical Chrome Options. Record this as an accepted exclusion and known limitation, never as a native PASS, repaired behavior or proof that a proposed Chrome API action works. No further retries or ordinary-input fallback are required for this excluded case.

The latest a313 native trial ended with the human failure report and visible Search `g15-human`. Its saved three-row/deadline trace did not exercise the selected self-tab action. Normal Quit, actual launcher exit0, two current known-lifetime absence views and marker release are bound by ignored `theme18-chrome-launch-a3134785b45e024373735cba/root-independent-result-and-closure.json` (SHA2560534367406935f05287eba01a7f3d98f76da3be6ccddd4f79865f744eb2925b2), with full viewer175f2581 and marker closure044701ab. Retain all earlier failed, refused, deadline, interrupted, unavailable and limited observations under their original bindings. This decision supplies no API efficacy, full historical descendant census or new native measurement.

All other requirements remain in force: actual fullscreen/display geometry, layout and final-control reachability, query/task/draft retention, ordinary keyboard and pointer entry, explicit focus/navigation/dismissal/return behavior on other paths, Chrome popup and other runtime gates, themes, persistence and each later consumer’s affected qualification. G14 and TT35 remain their separately scoped accepted decisions. Transport/security, account, external-owner, hardware/provider/OEM/assistive and release boundaries are unchanged.

The [specification](../spec.md) and [ticket19](../issues/19-deliver-accessible-navigation-and-reflow.md) consume this exact exclusion. The coordinator may resolve19 only by composing its remaining required evidence and recording normal review/integration/verification and closure; this decision alone resolves no ticket or finding collector.
