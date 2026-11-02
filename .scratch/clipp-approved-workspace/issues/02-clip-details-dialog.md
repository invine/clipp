# 02: Clip details dialog

**What to build:** Let a user inspect and act on a Clip in an accessible dialog opened from the full-width Clipboard History, without dedicating a permanent panel to details.

**Blocked by:** 01 — Responsive workspace and Clipboard History.

**Status:** ready-for-agent

- [ ] Selecting a Clip opens a dialog with its available content, type, source and time; long contents remain readable on narrow and wide screens.
- [ ] Existing supported copy, pin/unpin and Share Now affordances remain available with truthful result and error feedback; pin changes are reflected in the relevant list and Pinned view.
- [ ] Closing the dialog or pressing Escape returns the user to the prior list context and restores focus; keyboard focus remains contained while the dialog is open.
- [ ] Direct row copy remains independent of opening details; existing availability, failure and recovery states are retained.
- [ ] Test observable shared UI behavior and affected application UI, including keyboard and narrow layouts; use fixtures for sharing presentation and do not send Clips or run connection tests.
