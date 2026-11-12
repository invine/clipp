# 08: Install and confirm Android on a selected device

**What to build:** `android-local` installs a verified compatible debug or release APK on one explicitly selected Android device, preserves existing data and confirms the installed build and startup readiness.

**Blocked by:** 06.

**Status:** resolved

**Specification coverage:** Delivery targets; Configuration and prerequisites; Platform requirements — Android; Artifacts and records; Resumption and concurrency.

**Acceptance scenarios:** A04 (device readiness); A05; A10 (installation compatibility); A13; A14 (device/package ownership); A15; A16; A17.

- [x] The target uses ticket-06 preparation or reuses an equivalent verified APK with declared debug/release mode and attributable native acceptance evidence. It does not require Play access or a release upload credential for a compatible debug-mode installation.
- [x] Preflight selects one explicit serial and checks connection/authorization/readiness plus installed package, signature and version compatibility. A signature conflict, unsigned artifact or downgrade requirement blocks with a precise reason.
- [x] Artifact integrity and matching installation authorization are rechecked immediately before mutation. The selected device/package is exclusively owned across concurrent runs.
- [x] Installation preserves user data, Device Identity and settings. Automatic uninstall, data clearing, forced downgrade and implicit device selection are excluded.
- [x] Confirmation relates installed package/version/signature and payload to the selected APK, launches the app and observes readiness. Startup does not claim Pairing, transfer or background support qualification.
- [x] Disconnect or lost install acknowledgement yields blocked/uncertain state as appropriate. Resume observes actual device state before repeating installation; it neither rebuilds nor assumes success from the earlier command attempt.
- [x] Completed-plan replay performs no new installation. Stale locks are reconciled, unrelated devices/packages remain untouched, and receipts survive owned temporary cleanup.
- [x] Controlled destination tests cover signature conflicts, wrong serial/build, interruption and contention; real Mac-controlled selected-device evidence verifies installation/readiness under matching authorization. Help covers device selection and recovery.

## Comments

Published on 2026-11-10 with the approved breakdown. Implementation was deferred at publication.

Claimed on 2026-11-10 by the deterministic-delivery coordinator for the ticket-08 implementer. Baseline: client `b63237d59db2d42a53e1b60f719297bbb55b5722`; branch `codex/deterministic-delivery-08`; integration `codex/deterministic-delivery-integration`.

Implementation handoff on 2026-11-10: selected-serial Android local delivery, compatibility and authorization preflight, data-preserving install, cross-run device/package ownership, uncertain-response reconciliation, installed APK/certificate readback, launch readiness and replay were integrated at `88ad6949e3f5540152dd6c285e5d78dfe2c83007` (ticket commit `226013ae3b98c979b00e6407f65cd93a55b37c99`). The full check and normal commit hook each passed under Node 24.16.0 with Mac access: 210 Jest suites / 1,698 tests, 133 candidate tests and 116 delivery tests; the post-merge delivery suite passed 116/116. Controlled adapter and public CLI cases cover authorization, signature conflict, downgrade, selected serial, response loss, stale lock recovery and replay. No physical device, existing emulator/package or Play destination was contacted. Real public `android-local` acceptance remains pending a final frozen source after tickets 10 and 11: the native gate requires a new exact-revision acceptance APK pair and five-API matrix, followed by an owned fresh-emulator debug APK install/readback/readiness/replay with matching private authorizations. Five isolated API 31/33/34/35/36 AVD profiles are prepared but unbooted; no native matrix budget has been spent for intermediate revision `88ad6949`.

Final source-bound real acceptance on 2026-11-10: integration `28a40ffd4af4845f40fff500d130ec3ac29cda25`, public plan/run `92acf7c5-fc94-4372-98bb-99bf3cd90ba1`, profile SHA-256 `fbf4dbcfed9b350bb4827c190596412f4ff3aeaa6cb53c472bca45a5117a7ad5`. All nine local common checks passed; the exact-source acceptance pair and native unit gate passed; owned API 31/33/34/35/36 emulators each passed 28/28 required matrix cases. The separate debug APK on owned `emulator-5606` was installed under matching private source/build/APK/serial authorization. Readback, including an independent pulled APK, matched SHA-256 `1ce4f681ed76f38b6daa7b322886e244c3c83bb9fb10e3664c801cf894eb3e1b`, certificate `3cafea087eea9d7a6ddef7ddae360387c20d0b91e2463fe6debb256876a35681`, package `com.clipp.app`, version `1.0.4`/code `6`; foreground `MainActivity` and process readiness passed. Completed-plan replay added no install or launch attempt and left the run record byte-identical. The checksum-verified receipts and evidence manifest were retained privately. Only the five owned emulators were stopped and their owned AVD root removed after archiving; ADB then listed no devices. The earlier `92e7938` five-matrix run and its pre-install blocker remain archived separately and were not reused for this source. No physical device, existing emulator/package or Play destination was contacted.

Coordinator resolution on 2026-11-10: integrated controlled tests and the final source-bound owned-device receipt satisfy all checklist items. Ticket 08 is resolved; final workflow qualification remains tracked in ticket 11.
