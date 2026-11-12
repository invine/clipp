# 01: Plan delivery from an exact source revision

**What to build:** A caller can plan delivery for any of the six Clipp targets and inspect the exact source, destination, signing mode, required checks and unresolved prerequisites before execution. Planning preserves the user's checkout and performs no build or delivery.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Specification coverage:** Command interface; Source selection and candidate identity; Configuration and prerequisites; Purpose and scope.

**Acceptance scenarios:** A01; A03 (selection); A04 (configuration); A17 (plan data); A18 (scope).

- [ ] The public planning operation accepts a selected Clipp repository, committed source and one or more of the six specified targets. Unknown targets, invalid options, wrong repositories and unavailable revisions fail with stable human/JSON diagnostics.
- [ ] Named remote branches are resolved against the selected remote; inability to establish freshness blocks a latest-branch request. An explicitly requested immutable commit remains usable without claiming remote freshness.
- [ ] The immutable plan records repository identity, requested ref, full commit/tree identity, observation time, lockfile/version metadata, delivery-tool identity, profile/configuration hashes, target dependencies, expected checks and output/destination identities.
- [ ] Versioned target profiles and private configuration references express the spec's signing modes, supported Mac toolchains and destination requirements. Missing configuration produces actionable target-specific prerequisites; secrets are absent from plans and public output.
- [ ] Planning may use a dedicated fetch cache and read destination metadata, but does not install dependencies, build, change the caller's branch/index/work, install apps, publish, dispatch CI or require a Relay repository.
- [ ] Plans are stored durably outside disposable worktrees and packaging inputs. Record fields select known operations rather than arbitrary commands; invalid or unsupported schemas are rejected.
- [ ] Advancing main after planning cannot change the chosen source. Source/version/profile changes require a successor plan linked to its predecessor; credentials and application versions are not silently created or changed.
- [ ] Public-interface tests use real temporary Git repositories to demonstrate stale-ref selection, freshness failure, immutable revision selection and preserved caller state. Help explains planning effects and that a plan does not authorize delivery.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-01 implementer, following the user's implementation request. Baseline: client `a2c012265ea1a4aec04023431d9028be4fb0b933`; integration: `codex/deterministic-delivery-integration`; ticket: `codex/deterministic-delivery-01`.

Resolved on 2026-11-10. Source commits `7976fbfc0d63dc654a67e42329ce7301e8142ae3` and `a162c00702310ba8e64cd62c854d36f18cc9ece6` are integrated at client `2b493c8ab0b996b72270f218da38b20756c67c95`. Standards and Spec review found and then verified fixes for run-store symlinks, relative remotes, Play track selection and host prerequisites. Eight real-Git planning tests passed on the integrated revision; implementer lint, typechecks and Jest passed. `check:candidate` remained incomplete after repeated stalls in an existing ownership test; this is recorded as unavailable for the planning ticket, not a passing gate. No platform delivery was exercised.
