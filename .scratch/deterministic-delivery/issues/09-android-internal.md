# 09: Publish and reconcile Android internal releases

**What to build:** `android-internal` publishes the verified signed AAB to the configured Google Play internal-testing track and resumes interrupted publication by reconciling the existing remote operation instead of uploading or releasing twice.

**Blocked by:** 06.

**Status:** resolved

**Specification coverage:** Delivery targets; Configuration and prerequisites; Platform requirements — Android; Artifacts and records; Resumption and concurrency.

**Acceptance scenarios:** A04 (Play prerequisites); A05; A11; A12; A13; A14 (track ownership); A15; A17.

- [ ] Preflight confirms the selected Play application/internal track, publication access, expected upload certificate, acceptable versionCode and release notes against ticket-06 artifacts and private configuration. It neither resets credentials nor accepts legal terms or changes account protections.
- [ ] Publication requires matching authorization and an exclusive application/track owner across runs. Already applicable authorization is reused; a saved plan or permission reference is not itself permission.
- [ ] The recorded signed AAB is integrity-checked and uploaded without rebuilding. Unsigned outputs, failed required checks and unattributable acceptance evidence cannot enter publication.
- [ ] The run durably records remote draft/edit/upload/release identifiers and attempts around mutations, validates the uploaded candidate and completes the authorized internal release.
- [ ] A lost response or interruption marks the operation uncertain and triggers destination reconciliation before another write. Matching version number alone does not prove ownership or artifact identity; unresolved attribution remains uncertain or a conflict.
- [ ] An existing attributable draft resumes from its actual state. Successful upload or draft creation is incomplete until read-back confirms the intended version and completed release on the internal track.
- [ ] Completed-plan replay does not upload or publish again. Stale-owner recovery reconciles pending external mutations; the flow does not automatically publish a compensating release or administer testers/public production.
- [ ] Private credentials stay out of process arguments, plans and shareable diagnostics. Completion distinguishes Play's release state from eventual availability on a tester's phone.
- [ ] Public-interface tests simulate accepted uploads with lost responses, draft-only results, remote conflicts, concurrent owners and duplicate invocation. Real Play qualification is separately recorded and remains not run until an actual internal release is authorized; simulated results never count as publication evidence.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-09 implementer. Baseline: client `2be2a2fcc03fa62360995c283a029ddef1620444`; branch `codex/deterministic-delivery-09`; integration `codex/deterministic-delivery-integration`. Real Play publication is not authorized by the implementation request.

Resolved on 2026-11-10 at client integration `b63237d59db2d42a53e1b60f719297bbb55b5722`. Standards and Spec review confirmed the uncertain-response fix: public run/status retain `uncertain` and `play_response_uncertain` after lost upload/commit readback, and resume reconciles the recorded remote operation before another write. Focused controlled Play tests passed 14/14, public CLI regression passed on Node 24.16.0, and normal hook passed lint, 209 Jest suites, candidate tooling and 98 delivery tests. The Play adapter covers signed AAB admission, internal-only track, authorization, app/track ownership, durable edit/upload/draft/release records, readback and no duplicate publication in controlled tests. Actual Play internal publication remains **not run**: no selected production account, signing identity, release notes or separate publication authorization was used. No Play API was contacted.
