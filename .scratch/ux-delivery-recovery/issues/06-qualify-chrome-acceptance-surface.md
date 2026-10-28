# 06: Run trustworthy Chrome acceptance on the intended surface

**What to build:** Run a bounded Chrome acceptance scenario against the intended frozen extension and actual toolbar popup, with truthful surface, clipboard, debugger and cleanup evidence.

**Blocked by:** [02 — Prepare a reproducible acceptance candidate](02-prepare-reproducible-candidate.md), [04 — Enforce durable diagnostic limits through an existing runner](04-enforce-diagnostic-limits.md).

**Status:** claimed

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
