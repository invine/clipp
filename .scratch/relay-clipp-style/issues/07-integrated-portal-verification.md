# 07: Integrated portal verification

**What to build:** Verify the complete Clipp-aligned Relay portal against the approved design and existing portal contracts, documenting evidence and remaining limitations.

**Blocked by:** 02 — Usage history and Connect Clipp; 03 — Access and security; 04 — Account reviews; 05 — Quota Plan management; 06 — Sign-in, consent, and service messages.

**Status:** resolved

- [x] Verify the integrated served application through the established production portal HTTP boundary and built-service browser fixture using deterministic accounts, local identity provider and disposable migrated PostgreSQL where available. (Static portal HTTP checks passed; database/browser prerequisites were unavailable and are recorded below.)
- [ ] Compare both themes across desktop, tablet, phone and narrow layouts, including enlarged text, reduced motion, keyboard/focus, restricted and sparse states, current-week history and no-script paths. (Browser-rendered verification remains outstanding.)
- [ ] Check the design reference's small secondary text and chart whitespace warnings as user-facing review items; retain real information and do not hide content to pass a metric. (The reference warnings are recorded; rendered comparison was unavailable.)
- [x] Preserve functional and security behavior from the existing portal workspace specification, including actual account states, authorization, recovery, immutable plans and full retained history.
- [x] Use fixtures for connection and usage presentation; do not run connection tests, tests that send Clips, forced transfers or native-client journeys.
- [x] Record the tested revision, environments, commands, outcomes and explicitly unavailable or excluded checks; do not claim live connectivity or deployment acceptance.

## Answer

Integrated and reviewed at Relay revision `020f47da263d0765bae42b7505c760d8caac1a35`. Final verification commands and results are in Relay:`.local/relay-clipp-style/run.md`. Portal tests, safe auth portal tests, Go build/vet, gofmt and diff checks passed. No live connectivity, deployment or forbidden test journey is claimed.

The built-service browser and visual comparison remain independent acceptance work: this environment had no `CLIPP_TEST_SERVING_CONFIG`, dedicated `CHROME_BIN`, or supplied local serving/TLS setup. No rendered screenshots, contrast assessment, enlarged-text/reduced-motion browser checks, or actual keyboard/focus interaction checks were performed. These checks can be completed when that local fixture becomes available.
