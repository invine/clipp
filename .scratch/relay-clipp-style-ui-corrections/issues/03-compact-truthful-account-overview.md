# 03 — Compact, truthful account overview

Status: resolved
Owner: coordinator


Blocked by: None

**Delivers:** An owner sees the weekly allowance, recorded usage and separate Relay Session/Login Grant capacity in a compact layout that brings useful history higher on the screen.

**Visual evidence:** [Desktop account before](evidence/implementation-desktop-account-dark.png), [phone account before](evidence/implementation-phone-account-dark.png), [reference desktop](evidence/reference-desktop-account-dark.jpg), [reference phone](evidence/reference-phone-account-dark.jpg).

**Acceptance:**

- [ ] Give remaining allowance the strongest hierarchy, place recorded usage and effective limit together, make the UTC window/reset clear and use content-sized, aligned quota/capacity areas instead of stretched cards and redundant limit displays.
- [ ] Keep Recorded Relay Usage and Charged Relay Traffic explanations available without implying exact Clip payload traffic; retain a correctly proportional indicator and make Connect Clipp reachable.
- [ ] Use authoritative data for overrun (full recorded value and nonnegative remaining), zero allowance, known zero versus unavailable observations, independently sampled Relay Sessions and Login Grants, and Pending/Suspended/Denied/Recovery Review Hold states.
- [ ] Do not infer Device Network membership, device status or connection health from grants or Relay Sessions. Preserve read-only refresh, essential content and actions without JavaScript.
- [ ] Compare built-service renders to the reference in both themes across desktop and phone, including zero, overrun, unavailable and restricted fixtures; verify through the existing portal HTTP boundary and do not run connection or Clip-sending tests.

## Answer

The owner overview now gives remaining weekly allowance clear hierarchy, groups usage with its effective limit and UTC reset context, separates Relay Sessions from Login Grants, and sizes capacity panels to their contents. All usage and restriction facts remain server-derived; explanatory details and Connect Clipp stay reachable. Built-service fixtures covered zero, overrun, unavailable counts, restriction and Recovery Review Hold states. The expanded light sweep covered the owner view at 1440/768/390/320; dark browser coverage included all four widths and enlarged text. No real connection or Clip was used. See `../run.md`.
