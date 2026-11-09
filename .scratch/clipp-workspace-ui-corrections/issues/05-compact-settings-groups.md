# 05: Compact Settings groups and controls

**Blocked by:** None (can start immediately).

**Source:** [Corrective specification](../spec.md) and [visual review](../review.md).

**What to build:** Users can find and operate actual Settings in an aligned desktop layout and compact stacked phone layout without navigating oversized nested groups.

**Visual evidence:** [Desktop Settings before](../evidence/implementation-desktop-settings.png), [phone Settings before](../evidence/implementation-phone-settings.png), [approved mockup Settings](../../../mockups/clipp-workspace/index.html) (open Settings from navigation).

**Status:** resolved

**Acceptance:**

- [ ] Use clear category navigation, content-sized groups and aligned labels/actions on desktop; stack and scroll naturally on phone and short popup, avoiding unnecessary full-width selects and nested bordered panels.
- [ ] Preserve System/Light/Dark appearance, Auto Sync, notifications, retention, Clip Sharing Lifetime, managed relays, identity, diagnostics, continuity and available host-specific controls. The mockup's sample limit is not introduced as policy.
- [ ] Preserve applied, pending, partial, unavailable and recovery feedback; safety explanations, disabled states and destructive confirmations remain clear and accessible. Disabling Auto Sync does not erase History or stop local capture.
- [ ] Validate both themes, keyboard/touch focus, 200% text, long text and no horizontal overflow; actual runtime state remains authoritative.
- [ ] Exercise observable shared UI and safe affected applications with fixtures and no connection or Clip-sending tests.
