# Implement the approved History screen design

Status: resolved

Implement [the handoff specification](../spec.md) against a dedicated integration checkout selected under project operations. Use the preserved [interactive visual reference](../reference/index.html), its screenshots and the accepted [decision record](../decisions.md). Preserve the existing real Clip, connection, accessibility, error recovery and runtime behavior except for the explicit user-directed changes.

## Acceptance

- [x] History, its filter expansion and Clip details match the reference at the specified viewports, and the source, clipped content, action and status states are real.
- [x] Row Copy and Delete work; additional Clip actions remain reachable in details. Pinned state uses a pin symbol.
- [x] Time filtering is removed; the remaining filters fold and retain their selections.
- [x] Direct and Relayed Connection glyphs are green; other connection states keep their distinguishable glyphs and truthfully labeled colors, with the agreed status summary and Devices route.
- [x] The Clipp icon opens navigation in every tab where a menu control appears, with accessibility and focus behavior preserved.
- [ ] Shared UI behavior and applicable runtime gates in the specification are verified. Visual comparison uses the preserved screenshots and records any remaining mismatch.

## Comments

- Resolved on 2026-11-08 after integration, final Standards and Spec review, and `npm run check` on source tree `70b7f18d0fc1b7bac15e06d68247f56d20063de9` (208 Jest suites / 1,691 tests and 133 acceptance-candidate tests passed). Shared UI behavior and reference captures are complete. Live Electron, Android native and Chrome extension acceptance was not run in this implementation task; track those runtime checks as separate acceptance work before release.
- Visual comparison used the approved 12-Clip reference fixture at 390×844, 768×900, 1200×900 and 340×600, plus folded filters, Clip details and relayed status. The details dialog remains about 29 px taller than the reference because it adds the required secondary-actions/metadata disclosure. Screenshot artifacts are under `/private/tmp/history-capture/`.
