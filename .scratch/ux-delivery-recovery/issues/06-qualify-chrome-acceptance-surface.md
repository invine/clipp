# 06: Run trustworthy Chrome acceptance on the intended surface

**What to build:** Run a bounded Chrome acceptance scenario against the intended frozen extension and actual toolbar popup, with truthful surface, clipboard, debugger and cleanup evidence.

**Blocked by:** [02 — Prepare a reproducible acceptance candidate](02-prepare-reproducible-candidate.md), [04 — Enforce durable diagnostic limits through an existing runner](04-enforce-diagnostic-limits.md).

**Status:** resolved

**Assignee:** `/root/chrome`

**Claim:** ux-delivery-recovery-20261028-06; coordinator `/root`.

**Parent:** [Approved specification](../spec.md).

- [ ] Reuse the repaired maintained Chrome acceptance command and consume frozen candidate metadata plus the shared durable diagnostic policy. Required operational-reliability code must first be available on main.
- [ ] Establish the owned browser/profile, loaded extension identity and artifact mapping. Observe a harmless interaction on the intended surface before running the selected scenario; DOM presence or an attached debugger alone is insufficient.
- [ ] Apply five total attempts and the post-initial-failure twenty-minute diagnostic budget through actual Chrome invocations. A renamed output location cannot discard prior failed history.
- [ ] Classify wrong-target, stale-build, worker-evaluation timeout, unavailable native input and product failures distinctly. A retry needs a changed hypothesis and expected observation, not another unchanged attachment attempt.
- [ ] Demonstrate a focused behavioral scenario through the actual toolbar popup using the maintained runner. Ordinary-tab fixtures stay labeled as such; debugger attachment and its worker-lifecycle limitations are disclosed and cannot qualify an unaffected-lifecycle claim.
- [ ] Reuse applicable scoped clipboard authorization, recording only synthetic outcomes and permitted effects. The runner accepts authorization context per invocation and does not embed an effort-specific permanent bypass or read prior private clipboard data for receipts.
- [ ] Close exact owned browser/profile resources with bounded cleanup and current identity checks. Preserve failures and uncertain detached-helper limits without asserting impossible historical absence or touching unrelated Chrome instances.
- [ ] Public-command fixtures cover target mismatch, missing readiness, stale artifacts, retry/deadline refusal, cleanup failure and privacy canaries. The real popup demonstration has candidate-bound observations and cleanup evidence.
- [ ] Complete focused checks and applicable verification/review. Missing host access or unavailable required authorization remains an explicit blocker; fixture passes do not close the native portion.

**Scope boundary:** This is one reliable Chrome acceptance slice, not the entire UX popup matrix, account sign-in or live relay qualification. Product transport and clipboard capability boundaries remain unchanged.

## Review correction

Sourcecb61696 passed full checks and Standards review. Spec requires retained ownership when a known live target loses its profile command marker, and a worker-identity guard across no-PID launch intent so concurrent admission cannot erase it. The original owner supplies affected public-command controls and audits remaining-deadline coverage in the new adapter. Actual toolbar qualification is held until the corrected source is reviewed; fixture passes do not qualify it.

## Native qualification continuation

The user-authorized renewal retained all original failures. The actual Chrome 156 run verified the exact enabled extension identity/path, then rejected `Extensions.triggerAction` because it received a page target. Reviewed correction `ed0a64c` maps the owned page to one verified tab target; its frozen candidate is prepared. The renewal expired before that retry, so native toolbar/Local Clip/Pin qualification remains open. The coordinator stopped at the limit and is awaiting an explicit further decision. Primary evidence contains the immutable budgets and `ticket-06-renewal-1-stopped.json`.

## Answer

The maintained toolbar command consumes a verified frozen base plus extension sidecar, verifies the actual browser and acknowledged enabled extension/path, maps the owned page to its unique browser tab target, and opens the real toolbar popup through the browser action. Clipboard substitution precedes extension startup. The popup must report its own extension ID, popup view type, focus and memory boundary before filter input is accepted.

Source `90ebaae` corrects the native surface adapter: the narrow popup hides header Search, so this selected scenario waits for the visible Local Clip before the unchanged Pin/Pinned/public-state checks. The legacy ordinary-tab search helper remains unchanged. A public CLI regression failed before this correction and passed afterward; both affected reviews found no blockers, and the required hook passed 83 suites/848 tests plus 36 candidate cases. Integration mapping and exact review patch binding are preserved in primary evidence.

Frozen candidate 4 at source `90ebaae` passed the actual toolbar popup, filter interaction, Local Clip, Pin/Pinned state and verified owned-browser shutdown. Original failures, the user-authorized renewal decisions and immutable receipts remain preserved. Debugger attachment does not qualify unaffected worker lifetime, broader lifecycle, other surfaces or Pairing. The current entry/report owns successor applicability and the final coordinator resolution; the successful historical receipt is not relabeled as a later execution.
