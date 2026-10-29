# Integrate durable reset storage adapters

Type: implementation
**Status:** resolved
Assignee: ux-reset-storage-28
Priority band: 3
**Blocked by:** [27](27-implement-durable-manual-reset.md)
Dispatch: 2026-10-15 user-directed durable adapters with two implementers; qualification gaps retained
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Each reset adapter can prove durable intent and complete cleanup without stale fallback resurrection.

## Work and boundaries

Integrate core with Electron SQLite transaction/reopen, Chrome extension storage plus IndexedDB recovery, and strict Android native commit/error handling. Required receipt and replay guard precede private-marker removal; clean all owned identity/History fallback copies and recovery generations.

No fulfilled memory fallback as durability, inaccessible store as empty or mandatory receipt as best-effort notice. Logical deletion only; preserve installation preferences/configuration/credentials.

The [approved package contract](../../ux-implementation-plan/manual-identity-reset-proposal.md#runtime-responsibilities) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Implement the durable manual reset transition](27-implement-durable-manual-reset.md) — consume its completed, scoped output.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Use real adapter abrupt-stop/reopen around intent/deletion/candidate/receipt/guard/sanitization. Fault between both final metadata writes. Verify no former keys/membership/History/scoped backups remain after completion and existing automatic paths still pass.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate storage-backed reset proof on every host. SQLite transactional fake and web preview alone cannot pass; action remains unavailable.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: Supporting package or separate approved addition; see traceability. Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [storage.ts](../../../apps/electron/src/storage.ts)
- [chromeStorage.ts](../../../apps/extension/src/chromeStorage.ts)
- [storage.ts](../../../apps/android/src/storage.ts)
- [identityRotation.ts](../../../packages/core/trust/identityRotation.ts)
- [identityRotationSQLite.test.ts](../../../tests/core/trust/identityRotationSQLite.test.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work.

## Dispatch — 2026-10-15

The user explicitly requested ticket 28 implementation with two implementers, available checks and preservation of unqualified native gates. Core 27 is resolved at source4cd6fc94fc25f76f636f776712c4122eb799e9f5; current clean integration before dispatch is b86785d14dfa58a9d7f2258decf8016e0155e162 on codex/ux-implementation-integration. One claim ux-reset-storage-28 has two coordinated isolated source assignments: Electron SQLite plus Chrome storage/IndexedDB adapters; Android strict native persistence plus web fallback reconciliation. Coordinator owns all shared-file arbitration, integration and qualification.

Decision assessment: preserve accepted ADR0004 automatic rotation and ADR0008 application-owned key storage. Consume the existing serialized reset owner and accepted private intent/public receipt/replay boundaries. Do not create a second transition owner, accept fallback promises as durable proof, erase installation preferences or credentials, or activate a runtime without its complete writer/native ingress fences. Runtime admission/queue/restart remains29 and actions/UI30. Adapter composition must include its owning consumer without enabling an unsafe capability.

Approved test seams are the specified real SQLite store/reopen transaction, Chrome storage plus owning IndexedDB history generations, Android strict native storage commit/error interface with reconciliation of Preferences/localStorage/memory, and actual core coordinator composition. TDD at these already accepted seams requires no repeated approval. Available source, adapter, build and native unit checks run now; real browser/native abrupt-stop qualification is recorded separately and may remain unqualified. No reset of an operator profile, account/sign-in, host clipboard or global setting. Use disposable synthetic stores. All earlier failed gates/deferrals and standing approvals persist; no new harness preparation, push, PR or deployment.

## Implementation progress — 2026-10-16

Two implementers delivered the storage adapters and consuming runtime composition. Desktop/browser source `3465c9db8d4ef66ad51b8697a3fb7c9d382ff2db` and Android source `eb7768b91baaf01d28f28c92bf5562ea129b4d50` were independently fast-forward integrated by the mandatory merger. Reviewed and freshly verified integration source: `eb7768b91baaf01d28f28c92bf5562ea129b4d50`, tree `3948063f1364f1960e95a6df48dc636ffe0fa2c7`, clean, on `codex/ux-implementation-integration`. Baseline: `809fb318b52228c206c7ce74a3577ea161dabe0d`.

Electron uses the real SQLite adapter with FULL synchronous writes, transaction-backed cleanup/candidate installation and recoverable mandatory finalization. Chrome propagates callback storage errors and deletes/verifies every physical IndexedDB History generation, requesting and checking strict durability. Android adds a registered strict native commit/locking/error path, prevents cached confirmation after false/thrown commits, reconciles reset-bound Preferences/localStorage/memory copies and persistent/memory History, and inspects native reset metadata before ordinary startup even with manual capability absent. Installation preferences and relay configuration/credentials are preserved. Main/background/Android consume factories around the existing single core owner; production does not supply reset lifecycle fences or expose the action. Native-strict manual eligibility reads coexist with ordinary automatic writes and optional notices.

Both independent Standards and Spec reviews pass with zero actionable source findings against the exact final tree. Root `npm run verify` passes under Node 24.16.0 / npm 11.13.0: all typechecks, **144 suites / 1,015 tests**, all three production builds, lint with 0 errors / 840 warnings. Android native unit task and Java compilation pass, including two new false/thrown-commit tests; final web build, asset copy and unsigned release assembly pass under JDK 21 / Gradle 8.11.1. The unsigned APK and JUnit XML are preserved outside the worktree. No native runtime or emulator was launched.

| Boundary | Available evidence                                                                                                                         | Required qualification still open                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Electron | Real file-backed SQLite, SQL-trigger faults and graceful close/reopen through the owning coordinator                                       | Abrupt process termination and reopen at every required phase; graceful close is not crash proof              |
| Chrome   | Callback storage errors and fake IndexedDB all-generation, strict-durability refusal, receipt/guard/sanitization recovery tests            | Actual Chrome storage/IndexedDB acknowledgement and worker/browser abrupt-stop durability                     |
| Android  | Strict native Java primitive tests, plugin compilation, owning TypeScript/fake IndexedDB composition, fallback cleanup, final native build | Actual file-backed Preferences commit/reopen, process interruption and real WebView History/fallback recovery |

**Status remains claimed.** These required storage/native gates are unqualified, not waived or replaced by fixture/build results. G41 remains Candidate; runtime admission/queues/native ingress/restart are still 29, authenticated actions/UI 30, and full collection 31. All earlier failed gates, G14 unavailable host, Chrome native Pairing G01 unavailable endpoint and recorded deferrals remain unchanged. No source-only closure or new ticket was created.

Evidence lives in the run-20261010 artifact root supplied by the coordinator: `ticket28-desktop-browser-handoff.md`, `ticket-28-android-handoff.md`, both `ticket-28-*-merge-receipt.json`, both `ticket-28-*-review.md`, `ticket-28-integrated-verify.log` and hash-bound `ticket-28-integrated-verification.json`. Native APK SHA256: `c5f884afef881513bc8b6150beafc969095356d683b1ef00f41d8f3787d61337`. Source branches/worktrees remain clean and retained for pending qualification; native build daemons are closed.

The actual commit hook exposed an existing test-fixture Git-environment leak. The original failure is retained. The owned run stopped; coordinator audit proved primary files, refs, stashes and historical worktree heads preserved, then restored only introduced repository settings. Unchanged tracked hook gates passed with Git-local variables removed in the owned ignored launcher. Recovery and reproduction notes are preserved; no tracked hook/test infrastructure was changed. No repeated approval, clipboard, global setting, account/sign-in, push, PR or deployment action occurred.

## Qualification continuation — 2026-10-16

User requested implement-spec continuation until the whole backlog is complete. Continue the existing28 claim toward its required storage acceptance instead of bypassing its dependency. Two coordinated implementers: real SQLite abrupt-process/reopen and actual Chrome storage/IndexedDB checks; Android actual native file-backed persistence/restart checks. Baseline9f662794e86719a5ddc626de2d4fd92d1c5c21b0, existing isolated28 branches/worktrees preserved and advanced by inspected merge. No second claim/status, native gate waiver or blocked consumer dispatch. Native/UI resources remain root-owned; storage-only synthetic checks may proceed in isolated owned processes without operator data, clipboard, accounts or global settings. Actual guest execution requires existing isolation and root serial assignment. Preserve all older failures/deferrals and avoid repeating unchanged failed UI actors.

## Answer — 2026-10-16

Resolved for the complete durable storage package after mandatory integration, both independent source reviews, actual storage acceptance audit and fresh common verification. Final integrated source `6c0e26fc3567bda701ea6b2e4b70c80664a0974a`, tree `09635b5d4995ac5fe1f0230d27b05d86e1ba3965`, clean on `codex/ux-implementation-integration`. Two implementers supplied desktop/browser qualification and Android native/WebView qualification; a fresh bounded replacement author repaired the confirmed Android defect without overlapping native fixture ownership. All source ancestry is retained.

Actual SQLite passes nine SIGKILL/reopen cases, including open cleanup/candidate transactions and the durable quiescence checkpoint. Actual Chrome passes eight browser-crash and eight independent native-worker-stop cases using real extension storage and strict IndexedDB, including partial deletion. Android passes 22 native file-backed persistence cases (real false commit/cache refusal and both metadata-write orders) and all nine real WebView/core-owner abrupt-stop/recovery cases. The latter prove the durable original web seed across a fresh process before reset, same validated candidate, all-generation History/scoped/native/web/memory cleanup, installation settings and synthetic Keystore credential preservation, receipt/replay/dismissal and inaccessible-History recovery. Every owned guest/profile is closed; emulator clipboard sharing is exactly restored.

Actual qualification exposed old localStorage copies returning after candidate installation (`accepted/finalizing/cleanup_failed`, native remaining 0, web remaining 6). Production fix `d721565b345ff8b65acaf4745a3b932c29ef38d5` durably records bounded native authority for retired reset-owned keys, sweeps stale web/memory copies before identity admission and propagates invalid/unavailable evidence. Current native values, new History, preferences/credentials and automatic optional-notice semantics remain intact. The existing fixture seeds genuinely legacy native records rather than using reset effects for setup. All nine actual cases were requalified against the fixed combined candidate.

Fresh `npm run verify` PASS under Node 24.16.0/npm 11.13.0: lint 0 errors/843 warnings, all typechecks, 146 suites/1,033 tests and all three production builds. Both Standards and Spec source axes have zero actionable findings; the separate storage acceptance Spec audit verifies native receipts and closure. Earlier setup/parser/product failures and host-pause subprocess timeouts remain preserved; no test assertion, original failed gate or acceptance requirement was waived.

Coordinator-supplied artifact root contains `ticket28-final-integrated-verification.json`, `ticket28-final-integrated-verify.log`, `ticket28-android-native-authority-runtime-receipt.json`, `ticket-28-android-native-reopen-runtime-receipt.json`, desktop/browser and matrix hash bindings, all mandatory merge receipts and review reports, and `ticket28-storage-acceptance-spec-audit.md`.

This releases only storage dependency 28. G41 remains Candidate and incomplete: 29 owns real runtime writers/native ingress/queues/restart/clipboard baseline, 30 owns authenticated actions/UI and 31 collects full qualification. Production reset actions remain unavailable. Required G14 still lacks an alternate host and Chrome G01 still lacks an owned public/trusted endpoint; all other prior failed gates, external owners and deferrals remain unchanged. Primary dirty auth files, historical worktrees/branches/stashes and relay state are preserved.
