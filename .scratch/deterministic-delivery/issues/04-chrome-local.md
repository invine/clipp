# 04: Build and update the local Chrome extension

**What to build:** `chrome-local` verifies a production extension, safely updates its stable unpacked location and confirms that the explicitly selected Chrome profile is running that candidate rather than an older loaded build.

**Blocked by:** 02.

**Status:** resolved

**Specification coverage:** Delivery targets; Verification contract; Platform requirements — Chrome; Artifacts and records; Resumption and concurrency.

**Acceptance scenarios:** A04 (browser readiness); A05; A09; A13; A14 (extension/profile ownership); A15; A16; A17.

- [ ] The target consumes the frozen candidate's production extension without hidden rebuilding. Manifest, offscreen entry and complete asset inventory are validated; applicable identity, pairing, storage and managed-relay checks are explicit profile gates.
- [ ] Populated-history checks include long labels and narrow views. The profile records measured timing thresholds, fixture sizes, measurement boundaries and repetitions, with structural layout regressions retained; empty-history success cannot replace this coverage.
- [ ] Immutable artifacts are separate from the stable user-facing extension directory. An exclusive destination/profile owner preserves the previous tree and replaces the full inventory without stale extra files or mixed versions.
- [ ] Artifact integrity and authorization scope are checked before replacement. An interrupted copy/reload is reconciled against the actual destination before retry; restoration is reported successful only after verification.
- [ ] Confirmation observes the intended profile, loaded path, extension ID and source/artifact-specific build identity, then checks popup readiness. A shared version string or successful directory copy alone cannot complete the target.
- [ ] Supported browser automation is used where available; a required manual load/reload creates a resumable blocked handoff. Browser profile databases are never rewritten to force installation, and unrelated profiles/data remain untouched.
- [ ] Replaying a completed plan does not replace/reload again. Competing runs and stale-owner recovery cannot bypass shared destination ownership through different run stores.
- [ ] Public-interface tests cover stale loaded builds, failed replacement, manual handoff/resume, tampered artifacts and competing owners. Real Mac Chrome evidence confirms the loaded build; setup/help describes profile selection and recovery.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-04 implementer. Baseline: client `1677537ae80994f03240962cd4bb89bfd53d6cce`; branch `codex/deterministic-delivery-04`; integration `codex/deterministic-delivery-integration`.

Resolved on 2026-11-10 at client integrated Chrome revision `5838a5055e5bdf73f96de7dca169ac72eaf66ab4`. Standards and Spec review verified separate canonical destination/profile locks and repaired production offscreen/managed-relay gates; integrated delivery tests passed 56/56 and the implementer's full `npm run check` passed. Exact-revision Mac public run `e7098c84-25ca-4711-b3ba-9efbbce7f7b7` passed nine common and five Chrome gates, copied the immutable 44-file extension to an owned stable test directory, retained the previous file as backup, confirmed selected profile/path/extension ID/build marker/popup, and passed populated History timing with 43 rows, long labels and zero synchronous label reads. Replay left destination bytes and mtimes unchanged. Owned browser/profile cleanup passed; existing user profiles were untouched. Final review retains the nonblocking compiled-host gater probe coverage limitation.
