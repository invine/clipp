# 02 — Compact, unclipped navigation and Clipp identity

Status: resolved
Owner: coordinator


Blocked by: None

**Delivers:** The portal uses the approved Clipp identity and a responsive workspace header whose brand, destination, theme and menu controls stay visible and operable.

**Visual evidence:** [Phone account before](evidence/implementation-phone-account-dark.png), [phone account reviews before](evidence/implementation-phone-accounts-dark.png), [reference phone overview](evidence/reference-phone-account-dark.jpg), [reference desktop overview](evidence/reference-desktop-account-dark.jpg).

**Acceptance:**

- [ ] Replace the portal's abstract overlapping-squares mark with the approved Clipp C mark or equivalent approved portal asset, using existing embedded asset delivery and CSP; do not alter installed client icons.
- [ ] Recompose the shell around the reference's neutral surfaces, restrained purple accents, consistent icon language and aligned gutters in both themes without deleting real content or navigation.
- [ ] At 320–390 px and larger text/long labels, brand, destination, theme and complete Menu control remain within visible clipping bounds and are operable. Test actual element rectangles and clipping ancestors, not merely document scroll width.
- [ ] Desktop navigation and accessible narrow menu retain current-view indication, administrator authorization visibility, logout, keyboard open/close, Escape/focus restoration and no-script path.
- [ ] Check the served portal at desktop/tablet/phone sizes with reduced motion and keyboard/touch interaction; do not test real Relay connections or send Clips.

## Answer

Replaced the portal’s abstract mark with an embedded Clipp C SVG served with `image/svg+xml` and `nosniff`. The workspace shell now uses aligned neutral surfaces and restrained purple accents. Browser checks verified destination, theme and complete Menu control bounds at 320/390 px, tablet and desktop; enlarged text at 150% had no page overflow. Keyboard menu open, Escape close and focus restoration passed, as did the no-script menu. Reduced-motion preference removes nonessential transition/animation. No client icons or Relay connection behavior changed. See `../run.md` for the exact built-service verification boundary.
