# Report QR generation and payload Copy results

Type: implementation
Status: resolved
Assignee: ux-qr-06
Priority band: 1
Blocked by: 01
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim and branch details in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

QR generation and payload Copy expose pending, ready, failure and truthful Retry.

## Work and boundaries

Repair shared and options consumers, valid oversized text fallback and late-result guards. Copy reports actual clipboard-write result or uncertainty; a failed generation cannot leave an empty Hide state.

Payload Copy does not invoke retained-Clip reuse or Send; normal observation policy may capture copied text. Never auto-repeat an unconfirmed write or label decode/Copy as completed Pairing.

The [approved package contract](../../ux-implementation-plan/correctness-delivery-proposal.md#truthful-qr-generation-and-payload-copy) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Test deferred/no-target/rejected generation, fallback, Retry, close/identity change, clipboard rejection and lost acknowledgement through real UI actions. Qualify actual payload writes on affected native hosts with fresh synthetic markers. Native file import belongs to immediate Pairing results; OS permission and native-camera qualifications remain separately scoped.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate QR/clipboard branches; final QR sizing/Back and camera paths are contributed by navigation/native packages.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C08 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [qrCode.ts](../../../packages/core/pairing/qrCode.ts)
- [ClipboardApp.tsx](../../../packages/ui/src/ClipboardApp.tsx)
- [options.tsx](../../../apps/extension/src/options.tsx)
- [qrCode.test.ts](../../../tests/core/pairing/qrCode.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Answer

Resolved 2026-10-11 by the coordinator at clean integration `be96fbc7aa3b635fb3a0268e1d41231a3cc58cd8`, containing production code `364a854bcaa9a8cd4dca278bc5cd65b6fb050333`. Shared/current options consumers expose pending, ready, recoverable generation failures, valid complete text fallback, Close/identity late-result guards and truthful payload Copy results through every affected bridge. The options bootstrap uses the real ordered runtime observation path. Payload Copy remains distinct from retained-Clip reuse and Send.

Integrated routine verification passed 100 suites/761 tests and all three production builds. Final Standards and Spec passed; the latter reviews this integration against dispatch `239d2a19e8a356a03390810f982159e81cf4f155`. Controlled Chrome eight-case and Electron seven-case results passed. A fresh directly authorized host marker interval passed actual Chrome options/focused-toolbar and Electron native writes, each matching the complete displayed QR target and confirmed feedback; all profiles closed and the marker was restored before normal copying resumed.

Actual API35 guest native taps generated QR and submitted Copy once; the native 291-character payload matched the complete decoded displayed target with confirmed feedback and no horizontal overflow. Exact unmodified APK SHA-256: `8297dfd4b91b4078fd00ffffcfb4bcd1b6b206622d178957edff6bb1b55b880a`. Owned guest: `dev35_default_arm64-v8a_Pixel_2`, WebView 124.0.6367.219, physical 1080×1920/density420 and CSS412×732/DPR2.625. The emulator and forwards stopped before restoration of the prior absent host clipboard-sharing preference.

Receipts, source/build mappings, preserved APK, all failed attempts and final reviews remain at `/Users/invine/src/js/clipp/.local/ux-implementation/run-20261010/`: `ticket-06-receipt.md`, `ticket-06-integration-receipt.md`, `ticket-06-spec-review.md`, `ticket-06-host-native-receipt.md`, `ticket-06-android-native-metadata.json` and native/host closure JSONs. API31/WebView91 generation failed on missing browser APIs during messaging startup and remains an explicit provider limitation. Cellular isolation was not proved (`mobile_data` stayed1 after the disable command); no network or Pairing exchange claim follows. Native Back/final sizing, scanner/camera/permissions, terminal Pairing and broad assistive/physical/hosted gates retain their separate owners. C08 remains open for its remaining traceability contributions.
