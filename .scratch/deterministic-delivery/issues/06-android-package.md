# 06: Produce verified Android APK and AAB artifacts

**What to build:** `android-package` produces verified release APK/AAB artifacts, and Android local-delivery plans can prepare a declared debug or release APK through the same candidate flow. Signing state and native evidence are explicit and reusable by delivery targets.

**Blocked by:** 05.

**Status:** resolved

**Specification coverage:** Delivery targets; Configuration and prerequisites; Verification contract; Platform requirements — Android; Artifacts and records.

**Acceptance scenarios:** A04 (signing/toolchain); A05; A06 (mode compatibility); A10 (evidence binding); A13; A16; A17.

- [ ] `android-package` produces both release APK and AAB from the frozen source. Local-delivery preparation supports a declared debug or release APK without falsely describing a debug APK as the release-package target's output.
- [ ] Source/build inputs remain unchanged, and acceptance evidence from ticket 05 is bound to the same revision and declared configuration with flavor differences recorded. Acceptance APK digests are never presented as production artifact digests.
- [ ] The target validates application ID, versionName/versionCode, SDK metadata, bundled web assets and absence of a development-server URL. Version changes require a successor candidate rather than an in-run source edit.
- [ ] The default release profile signs with the configured upload identity and verifies the expected certificate. Credential references are private, secrets do not enter arguments or shareable logs, and missing/wrong keys cause a precise blocker without key creation or reset.
- [ ] An explicitly selected artifact-only unsigned profile is clearly labeled and cannot satisfy an installation or internal-publication gate. Signing failure never silently falls back to unsigned success.
- [ ] Artifact records include size, digests, source/flavor/toolchain identities and signature metadata. Signing/repackaging transformations are linked successor artifacts; only equivalent inputs may reuse earlier results.
- [ ] Interrupted builds retain diagnostics and cannot yield complete artifacts. Tampering, missing outputs and incompatible signing modes prevent reuse; this target does not install on a phone or contact Play to publish.
- [ ] Public-interface tests cover signatures, mode separation, manifest/source mismatch, development-server contamination and interrupted preparation. Real Mac packaging evidence verifies APK/AAB contents and declared signatures; help explains signing setup and artifact-only behavior.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-06 implementer. Baseline: client `95db68a1e6d859c903aafefcfa2032eb65f3863d`; branch `codex/deterministic-delivery-06`; integration `codex/deterministic-delivery-integration`.

Resolved on 2026-11-10 at client integration `2be2a2fcc03fa62360995c283a029ddef1620444`. Standards and Spec review verified fixes for frozen `com.clipp.app` identity and exact public web asset sets in staged files, APK and AAB. The normal commit hook passed lint, 209 Jest suites, 133 candidate cases and 69 delivery tests; integrated focused package tests passed 11/11. The private Mac package-only receipt records JDK 21, Gradle 8.11.1, SDK build tools 35.0.0, bundletool 1.17.2, APK/AAB manifests, web files, hashes and explicit unsigned state for exact source commit `d952970bc58649e50235dd8a9b7fbc8fca176849`. This preflight did not run the native qualification for its package revision and does not establish a signed, installable or Play-ready candidate; no upload identity was available. Controlled tests cover signed certificate validation and blocked missing/wrong key behavior. No device installation or Play contact occurred.
