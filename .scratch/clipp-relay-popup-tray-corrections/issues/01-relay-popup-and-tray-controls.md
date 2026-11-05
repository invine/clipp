# 01: Correct relay login feedback, popup expansion and desktop tray controls

**What to build:** Make successful managed-relay login remove the login prompt and produce accurate, visible connection feedback; let extension users open full-page Clipp without a separate toolbar row; make the Electron tray icon legible and open Clipp on a normal click, reserving its menu for right-click. This is the single implementation handoff requested for original findings 1, 4, 5 and 6.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] Successful Clipp managed-relay authentication removes the Log in action while the credential remains usable; browser portal login alone is not treated as Clipp authentication. Authentication expiry/rejection restores the appropriate login action. Temporary transport failure does not falsely imply logout.
- [ ] The top-right status control reflects current observed facts after login without reloading. Relay ready with no connected Trusted Device is distinguishable from an established Direct Connection or Relayed Connection. Login success alone never claims a peer connection. The visible control, tooltip and accessible name agree; its signal remains visible at narrow widths.
- [ ] Shared login and status behavior works through Electron, extension and Android state bridges. Regression coverage exercises the transition from login required to authenticated/ready and back to authentication required, including a relay-ready/no-device case.
- [ ] The extension popup offers Open full-page Clipp as an accessible compact expand control in the existing header, eliminating the separate always-present navigation row. Keep existing navigation semantics, keyboard operation, visible focus, pending/disabled protection, and actionable error/retry handling. Successful navigation leaves no empty notice strip. Do not change full-page routing or remove management capabilities.
- [ ] The popup action fits the smallest supported popup width alongside existing header controls without overlap or reducing the existing hit-target standard. Preserve the existing visual system; no new toolbar or card-height increase.
- [ ] The Electron tray artwork is tightly framed and visibly legible at normal menu-bar size, with correct density representations and macOS template-image behavior. Verify development and packaged asset loading, Retina/non-Retina rendering, and light/dark menu bars. Do not merely select a larger padded bitmap.
- [ ] A normal tray click opens, restores and focuses the existing Clipp window, or creates it when absent; it never opens the menu. Right-click alone opens the existing options, including Quit, on macOS and Windows. Handle platform-specific attached-menu behavior; preserve Linux compatibility within desktop-environment limits.
- [ ] Add focused regression checks at the real transition/event seams; verify actual popup interaction and native tray behavior. Run required repository checks before any code commit and distinguish source checks from live/native evidence.

## Scope boundaries

Original finding 2 (device row status colour) is excluded. The user's constraint is to reuse existing status text and preserve card height: no duplicate text or extra status line. Original finding 3 (extension/Electron and Android/Electron direct connectivity) belongs to a separate troubleshooting session and does not block this ticket. Do not redesign the workspace, change relay policy, or mutate live credentials/membership to make UI checks pass.

## Comments

2026-11-05: User approved this single-ticket grouping with no blockers and explicitly instructed: “Do not start implementation.” Publication only; no implementation has begun.

2026-11-05: The user later requested `$implement` for this feature, authorizing implementation in the accepted scope. This supersedes the publication-only session boundary; see D6.
