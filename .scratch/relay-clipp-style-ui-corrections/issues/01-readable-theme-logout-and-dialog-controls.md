# 01 — Readable theme, logout and dialog controls

Status: resolved
Owner: coordinator


Blocked by: None

**Delivers:** Relay users can read and operate theme, logout and dialog-close controls in both themes, including keyboard/focus and ordinary interaction states.

**Visual evidence:** [Dark desktop account before](evidence/implementation-desktop-account-dark.png), [dark Connect Clipp dialog before](evidence/implementation-desktop-connect-dark.png), [dark phone dialog before](evidence/implementation-phone-connect-dark.png), and [approved mockup](../../mockups/clipp-relay/index.html).

**Acceptance:**

- [ ] Fix the observed near-invisible dark text on Light theme, sidebar/menu Log out and Connect Clipp Close; scope foregrounds to their real control fills so readable light-on-dark and dark-on-purple combinations are maintained.
- [ ] Across owner, admin and standalone pages, relevant controls meet WCAG AA text contrast and meaningful control-boundary requirements in default, hover, focus and disabled states where applicable; keyboard focus is visible.
- [ ] Investigate the user's prior light-theme unreadable-text report across signed-out, authenticated, admin, consent, error and interaction states. Record the affected case and resolution if reproduced; otherwise document the unlocated report and actual coverage without claiming it is fixed.
- [ ] Theme choice, persistence/fallback when storage or JavaScript is unavailable, navigation/logout and dialog close/focus behavior remain functional and retain existing authorization and no-script behavior.
- [ ] Verify computed contrast and observable behavior through the established HTTP and built-service browser seams using isolated fixtures; explicitly record exclusions and unavailable prerequisites.

## Answer

Implemented and verified on the built service. Theme, desktop sidebar logout, phone-menu logout, primary action and Connect Clipp dialog-close controls now use readable foreground/background combinations with visible keyboard focus. Light-theme enabled-control text measured at least 5.97:1; hover text measured 14.1:1 for theme and dialog close, and 14.2:1 for both logout variants. Dark-theme hover measured 14.57:1 for theme, 13.05:1 for both logout variants, and 12.31:1 for dialog close. All measured focus rings were visible at 3 px. Persistence, Escape, dialog closure and focus restoration passed the isolated built-service browser run. The fixture had no disabled controls to measure. The earlier unreadable light-theme report could not be located or reproduced across the recorded signed-out, owner, admin, security, plan, recovery/error and interaction states; it is not claimed resolved. See the integration evidence and exclusions in `../run.md`.
