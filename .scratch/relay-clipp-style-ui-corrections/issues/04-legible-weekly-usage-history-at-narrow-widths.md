# 04 — Legible weekly usage history at narrow widths

Status: resolved
Owner: coordinator


Blocked by: None

**Delivers:** Owners can read recent and retained Recorded Relay Usage at desktop and phone sizes, with the current week visible and exact values accessible.

**Visual evidence:** [Phone account/history before](evidence/implementation-phone-account-dark.png), [reference phone overview](evidence/reference-phone-account-dark.jpg), [desktop overview before](evidence/implementation-desktop-account-dark.png).

**Acceptance:**

- [ ] Present the latest four weeks by default and the full current week plus twelve retained preceding weeks on request, in chronological order, with the current week explicitly incomplete.
- [ ] On narrow screens, use a readable compact chart or stacked/list representation plus an accessible exact-value table or equivalent; avoid breaking headings, dates, totals or “incomplete” inside words and avoid page-level horizontal scrolling.
- [ ] Preserve complete UTC dates, exact byte totals, independent missing versus recorded-zero states, absolute history and current-week visibility regardless of later allowance changes; do not fabricate points to improve density.
- [ ] Screen-reader, keyboard, enlarged-text, both-theme and no-script access retain all real values and range controls.
- [ ] Exercise the existing HTTP and built-service browser seams with deterministic history fixtures, including zero, missing, overrun and thirteen-week cases; do not run connection or Clip-sending tests.

## Answer

The account page presents the latest four weeks as a readable phone list, with the full retained thirteen-week history and exact accessible table values still available. Current-incomplete, recorded zero and unavailable history remain distinguishable; dates and exact values are preserved. Built-service browser checks verified the current week and four-week default at narrow widths, then all thirteen weeks at 390 px, with no page-level horizontal overflow. No data was fabricated and no live connection or Clip was used. See `../run.md`.
