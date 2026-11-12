# Deterministic Clipp delivery specification

Status: implemented (PR #55, merge `f1e3759`)
Date: 2026-11-09 (Asia/Dubai)
Owner: client (Clipp)
Decision source: [decisions.md](decisions.md)

## Purpose and scope

Provide one resumable local flow for testing, building, packaging, installing and publishing Clipp. A caller selects source and targets; the flow owns prerequisite checks, execution order, artifact identity, recovery and truthful completion reporting. An agent must not reconstruct release steps from earlier conversations.

The first version runs entirely on macOS. Electron, Chrome and Android builds and all required verification run on that Mac, including Mac-hosted Android emulators and explicitly selected connected phones. Dependency downloads, remote Git reads and Google Play publication may use the network. Hosted CI is supplementary evidence, never a substitute for required local results; the flow neither dispatches CI nor waits for it as a required gate.

There is no Relay repository, image build, Kubernetes deployment or `relay-test` target. Existing Clipp networking acceptance may use an already configured test endpoint when required and authorized; provisioning or changing a relay is outside scope. This work does not change product behavior, supported platforms, transport fallback, membership, credential security or background-continuity qualification policy.

Deterministic means declared inputs select a versioned procedure, evidence requirements and completion criteria. It does not promise byte-identical signed packages across builds. First-version sources are committed revisions; automatic commits, version bumps, merges, pushes and dirty-working-copy snapshots are outside the execution flow.

## Delivery targets

| Target             | Artifact and action                                                                                         | Completion criterion                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron-package` | Build a macOS DMG and retain the packaged app used for checks.                                              | Source gates, package inspection and packaged runtime gates pass; checksums and signing state are recorded. No installation.                                           |
| `electron-local`   | Prepare or reuse an equivalent verified Electron package and install it at the configured application path. | Installed content matches the candidate; launch and normal Quit pass; previous installation and recovery information are retained.                                     |
| `chrome-local`     | Build a production unpacked extension and copy verified contents to the configured stable directory.        | Directory identity is verified and the selected Chrome profile's loaded extension is confirmed to use that build; popup check passes.                                  |
| `android-package`  | Produce release APK and AAB, with a declared signing mode.                                                  | Source/native/package gates pass; package IDs, versions, signatures or explicit unsigned state, and checksums are verified. No phone installation or Play publication. |
| `android-local`    | Build or reuse a compatible APK and install it on one explicitly selected device.                           | Installed package/version/signing identity and payload correspond to the APK; launch/readiness passes without clearing existing data.                                  |
| `android-internal` | Build or reuse a signed release AAB and publish it to the configured Play internal-testing track.           | Required gates pass; the uploaded version and completed release are confirmed on that track. Draft creation or successful upload alone is insufficient.                |

Multiple targets may share one run. Shared gates and builds run once when their complete inputs match. Success is tracked per target: an Android key or phone blocker must not prevent an independent Electron package or Chrome result. The run is complete only when every selected target is complete; partial completion is reported explicitly.

## Command interface

The future root npm command exposes three operations. These examples specify the interface; no such command is implemented by this handoff.

```sh
npm run delivery -- plan --source origin/main --target electron-package --target chrome-local
npm run delivery -- run /absolute/path/to/plan.json
npm run delivery -- run <run-id>
npm run delivery -- status <run-id>
```

- `plan` validates options, resolves the source, combines versioned target profiles with private local configuration and writes an immutable plan to the configured durable run store. It reports unresolved prerequisites without installing dependencies, building, installing apps or publishing. It may read remote source/destination metadata and update a dedicated Git fetch cache.
- `run <plan-file>` starts or resumes the run associated with that exact plan identity. Replaying the same plan does not create another delivery. `run <run-id>` resumes the same run; it does not refresh source or change targets.
- `status` reads recorded state without network calls, credential retrieval, builds or destination mutations. It displays the last observation time; it does not claim the destination is still unchanged.
- Each operation supports human output and `--json`. Invalid options, failed required checks, blocked execution and uncertain delivery have nonzero outcomes and stable machine-readable result codes. A successful `status` query may report a blocked run without treating the query itself as failed.
- Commands identify the selected Clipp root explicitly through configuration or a validated current repository. They never infer a relay root. Record data selects known target/check IDs; it cannot inject arbitrary shell commands.

A plan presents the source hash, version, targets, destination identities, signing mode, expected checks, output locations and unresolved prerequisites before execution. A plan is data, not permission: actual installation/publication requires matching user authorization. Reuse authorization that already covers the operation; do not request a new confirmation at every internal stage.

## Source selection and candidate identity

1. Resolve a named remote branch against that remote during planning. Cached `origin/main` alone cannot establish latest main. If freshness cannot be established, block that source request; an explicitly requested immutable commit can be used without pretending it is latest.
2. Record requested ref, resolved full commit hash, repository identity, observation time, source tree, lockfile hash and relevant version metadata. Reject an unavailable revision or the wrong repository.
3. Prepare an isolated checkout at the selected commit with its own dependency installation. Preserve the caller's branch, index, edits, worktrees and installed applications. Ignore unrelated untracked build outputs in the primary checkout.
4. Record the delivery-tool revision separately from the application revision. A tool update cannot silently alter a saved plan. Required source adapters must exist or be explicitly supported by the pinned tool; missing compatibility is a prerequisite failure.
5. Freeze source/configuration inputs before verification. Generated outputs have declared locations; unexpected tracked-source changes fail the candidate. A version bump or source correction produces a new plan/candidate and links to the prior run.

Remote main advancing after selection does not change a running candidate. Delivery always identifies the selected hash. The user must request a new candidate to include later commits. No implicit cherry-picks or uncommitted overlays enter a release.

## Configuration and prerequisites

Checked-in profiles define target dependencies, supported host/architecture combinations, build options, required check IDs, toolchain pins, artifact layout, signing requirements and timeout policies. Profiles are versioned; their hashes are inputs to a plan. The first supported Electron packaging architecture must be declared from a validated local toolchain; cross-compilation or additional architectures require explicit profiles and evidence, not automatic support claims.

Private local configuration defines the durable run/artifact root, stable extension directory, application installation path, selected Chrome profile, Android SDK/JDK paths, device serials or owned emulator definitions, Play application/track identifiers and credential references. Keep secrets out of Git, plans, command arguments and public reports. Retrieve them through the configured private file/keychain/environment mechanism and redact diagnostics before saving shareable summaries.

Preflight verifies Node/npm against the profile, lockfile installation capability, macOS/architecture, sufficient storage, required packaging/native tools and writable owned output paths. Platform preflight additionally verifies signing certificate identity, device readiness, browser availability and publication credentials as applicable. Check key metadata without exposing private key material. Report missing or mismatched credentials; do not create/reset keys or modify account protections.

Separate build prerequisites from delivery readiness. A disconnected phone or locked Chrome session can block the delivery stage while independent source checks and packaging proceed. Recheck transient readiness immediately before use. Target-private blockers do not become global blockers.

The v1 defaults are local unsigned Electron DMGs with explicit signing status; Android package/internal release artifacts use the configured upload signing identity. An explicitly selected artifact-only unsigned Android profile may produce clearly labeled unsigned outputs, but cannot satisfy `android-internal` or an installation gate. `android-local` requires a declared debug or release signing mode compatible with the selected installation; it never silently changes mode or uninstalls a conflicting package. Notarization and public store distribution are outside v1.

## Run lifecycle

The procedure follows: resolve source → preflight → verify source → build candidate → verify artifacts and applicable runtime behavior → deliver → confirm destination → retain receipt.

| Stage            | Required result                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Prepare          | Isolated source and dependency installation match declared inputs.                                             |
| Verify source    | All required common checks pass and target-specific checks are allocated.                                      |
| Build            | Requested artifacts exist; source inputs remain valid; build logs and tool identities are retained.            |
| Verify candidate | Artifact inventories, signatures and required runtime checks pass for attributable artifacts.                  |
| Deliver          | Recorded artifact is installed/published at the selected destination; outcome is recorded or marked uncertain. |
| Confirm          | Fresh destination observation establishes the target's completion criterion.                                   |
| Retain           | Completion/failure receipt and required artifacts survive temporary-checkout cleanup.                          |

Steps have `pending`, `running`, `passed`, `failed`, `blocked`, `uncertain` or `not-applicable` state. Target/run summaries distinguish complete, incomplete and blocked/failed/uncertain work. An inapplicable step is justified by the frozen profile; a missing or skipped required step cannot pass. Preserve prior attempts rather than overwriting failures with the latest result.

Use declared timeouts and bounded readiness polling. Setup, test execution and cleanup have distinct observations. Preserve existing native attempt budgets, renewal decisions and ownership policies; this spec does not reset or weaken them. Poll observable readiness instead of assuming that a fixed delay establishes success.

## Verification contract

Use [routine verification](../../docs/agents/verification.md) as the common source gate and include the dedicated shared UI behavior suite. Existing npm scripts remain executable sources. The command must account for builds already performed by `verify` and avoid rebuilding identical outputs merely to enter the packaging stage.

| Coverage         | Required allocation                                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common Clipp     | Local lint, all runtime/shared typechecks, Jest, candidate tooling, production compilation and shared UI behavior suite.                                                                                                                                 |
| Electron targets | Package inventory and native dependency load, packaged WebRTC smoke, production-main Quit regression using packaged dependencies; installed launch/Quit additionally for `electron-local`.                                                               |
| Chrome target    | Production manifest/offscreen/assets validation, existing identity/pairing/storage/managed-relay checks applicable to the production extension, populated-history performance regression and loaded-build confirmation.                                  |
| Android targets  | Native unit tests, applicable selected-candidate instrumentation matrix, source/flavor provenance, APK/AAB manifests and declared signature checks. Local installation adds selected-device startup/readiness; Play publication adds release validation. |

Resolve this allocation to explicit check IDs and commands in the frozen profile. Preserve required API/scenario matrices in the existing [Android acceptance](../../docs/android-managed-relay-native-acceptance.md) and [background continuity release procedure](../../docs/android-background-continuity-release.md). Existing physical qualification, native acceptance and retry policies retain their scope; this flow neither declares them satisfied by unit tests nor requires an unrelated support-qualification campaign for every package. If a required gate cannot be allocated unambiguously, report that prerequisite instead of silently selecting a smaller suite.

Browser checks use representative populated history, long labels and narrow views, in addition to empty/error states. Timing gates specify fixture size, measurement boundary, repetitions and threshold in the versioned profile; retain structural regressions such as repeated synchronous layout measurements. A performance assertion cannot be declared passing from an empty-history probe.

Source tests may run before packaging. Post-build tests consume explicit artifact paths without an implicit rebuild. When existing scripts combine build and test, separate or adapt that invocation during implementation while preserving behavior. Routine CI's native-binary skip configuration must not leak into Mac packaging prerequisites.

Acceptance evidence binds source, configuration, runner identity, artifact identity and execution environment. Reuse is permitted only for demonstrably unchanged required inputs under existing applicability rules. All required observations originate locally for v1. A prior CI result, compilation pass or artifact hash alone is not runtime acceptance.

## Platform requirements

### Electron

Pin the packaging tool and native toolchain. Retain the existing application file allowlist and explicit extra-resource selection. Write packages outside application source directories. Inspect the actual archive/unpacked inventory and reject nested DMGs/app releases, unexpected source artifacts or missing production dependencies. File integrity and disk-image integrity are separate checks; neither alone establishes correct contents.

Record signing status, architecture, app version, source identity and artifact checksums. A version such as `0.0.0` cannot serve as build identity. Verify tray/resource hashes and packaged native loading. For local installation, serialize access to the destination, preserve a recoverable prior bundle, stop only the selected Clipp application as authorized, install the candidate, and verify content identity plus launch/normal Quit. Preserve profiles, history and user data. Report a failed replacement and the available recovery path; do not claim the old installation is restored until checked.

### Chrome

Keep immutable extension artifacts separate from the stable user-facing unpacked directory. Copy with replacement/backup semantics so failure cannot leave a mixed old/new tree. Verify the full destination inventory, including absence of stale extra files, and preserve the previous copy for recovery.

Select a profile explicitly. Confirm the extension's loaded path, ID and a source/artifact-specific marker or equivalent observable build identity; a directory copy alone is insufficient. Never rewrite browser profile databases to force loading. Use supported automation or a bounded user handoff if Chrome requires manual load/reload, retaining `blocked` until actual loaded-build confirmation. Test popup readiness against the intended build; version strings shared by multiple builds are insufficient.

### Android

Pin the required JDK, Gradle wrapper, Android SDK/build tools and web dependencies. Reject development-server URLs in packaged assets. Build normal production/debug and isolated acceptance variants from the same selected source with their build options recorded. Acceptance packages may differ in package ID, callback scheme, signing and instrumentation; their hashes must not be presented as hashes of the production APK/AAB.

`android-package` yields both release APK and AAB. Verify application ID, versionName/versionCode, SDK metadata, packaged web assets and explicit signing state. `android-internal` requires the expected upload certificate and a versionCode acceptable to Play; signing failure cannot fall back to unsigned success.

`android-local` can reuse a compatible APK from `android-package` or build its declared debug profile. Select one serial explicitly; validate package/signature/version compatibility before installation. Preserve data and existing identity. A signing conflict or downgrade requirement blocks installation and identifies the reason; automatic uninstall, data clearing and forced downgrade are excluded. Record installation evidence sufficient to relate the installed package/payload to the selected APK, then launch and observe readiness. Startup alone does not prove pairing or transfer.

For `android-internal`, check the selected Play application, internal track, upload certificate, version and release notes. Upload the recorded AAB without rebuilding, validate it, complete the authorized release and read back the track/version/release state. Preserve draft/edit identifiers for resumption. A completed release does not guarantee immediate availability on every tester's phone; tester installation is separate evidence. Public production, tester-account administration, credential replacement and terms acceptance are outside this operation.

## Artifacts and records

Store a versioned immutable plan and durable per-run observations under the configured private run root, outside disposable worktrees and packaging source roots. Use a generated run ID; a short commit hash alone is not unique. A small run manifest references existing native receipts rather than copying their state machines or creating a competing ticket tracker.

Record at minimum:

- Requested/resolved source, repository identity, tool revision, profile/configuration hashes and selected targets.
- Actual tool versions, dependency/lockfile identity, architecture, build mode and secret references without secret values.
- Per-artifact path relative to the run store, kind, size, digest, source/build identity and signing metadata.
- Per-check ID, inputs, environment, attempt, start/end, result, timeout/cleanup outcome and evidence references.
- Per-target destination identity, authorization source/scope reference, delivery attempt IDs, last confirmed remote/installed state and remaining action.
- Parent/successor relationships for changed candidates and transformations such as signing, plus recovery references.

Writes must survive interruption: atomically replace manifests, retain prior attempt evidence and detect incompatible schema or corrupted records. Verify artifact checksums before reuse and immediately before delivery. Signed or repackaged outputs are new artifacts linked to their inputs. Keep private logs restrictive and sanitized summaries shareable. Record metadata is evidence, not executable code or authorization.

## Resumption and concurrency

| Situation                                                         | Required behavior                                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed stage, matching inputs/artifacts                        | Reuse recorded result after integrity checks; avoid redundant tests/builds.                                                                               |
| Source/profile/signing mode changed                               | Create successor plan; retain prior candidate and invalidate affected evidence.                                                                           |
| Artifact missing or changed                                       | Block delivery/reuse; preserve original digest and require regeneration plus renewed affected checks.                                                     |
| Build interrupted                                                 | Preserve diagnostics; retry only in owned temporary output, never treat partial artifacts as complete.                                                    |
| Phone/browser unavailable                                         | Continue independent work; resume at readiness for that target.                                                                                           |
| Upload/install response lost                                      | Mark uncertain and inspect actual destination state before repeating a mutation.                                                                          |
| Destination already matches                                       | Record reconciled completion only after the target's confirmation checks.                                                                                 |
| Existing remote version cannot be attributed to this artifact/run | Keep uncertain or report conflict; matching version number alone is insufficient.                                                                         |
| Completed run invoked again                                       | Validate existing records and report completion; do not duplicate publication or replace the installation again. A requested fresh delivery is a new run. |

Maintain exclusive ownership for a run and for shared destination resources: app path, extension directory/profile, Android device/package and Play application/track. Separate processes/runs must not bypass these locks through different output directories. A stale lock is not automatically cleared on elapsed time; establish that its owner stopped and reconcile any uncertain external operation first. Serialize shared native resources while allowing independent targets to progress.

Automatic retries are limited to identified safe preparation/readiness operations. Ambiguous external writes require reconciliation. Device disconnection or process termination cannot turn an incomplete operation into success. Rollback is target-specific: desktop/extension backup restoration is distinct from Android updates or Play release changes; v1 does not automatically publish a compensating release or uninstall user data.

## Architecture and reuse

Use one delivery orchestration module with a small command interface and platform adapters for prerequisites, build, artifact checks, delivery and destination inspection. Share source selection, durable records, integrity checks and resource ownership. Keep native details in platform adapters rather than duplicating command sequences in agent instructions.

Reuse or carefully extract suitable behavior from [candidate preparation](../../scripts/prepare-acceptance-candidate.mjs), [source identity](../../scripts/source-identity.mjs), [Android provenance](../../apps/android/scripts/android-candidate-provenance.mjs), existing acceptance runners and evidence-applicability tooling. Their current schemas may be scenario-specific; reuse is not permission to weaken native isolation or to force every release into an Electron scenario record. The delivery runtime must function without the companion Relay repository, even where older coordinator tooling assumes two roots.

Source-controlled profiles own executable coverage. Operational documentation points to the command and profile help rather than restating shell sequences. Existing issue statuses and implementation coordinator records remain authoritative for development work; delivery run status describes delivery only.

## Acceptance scenarios

Test the public command interface with temporary real Git repositories, controlled process adapters and simulated destination responses. Complement these with real Mac packaging/runtime runs; simulated publication cannot establish actual Play publication.

| ID  | Scenario and expected result                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Local main is stale; planning `origin/main` selects the observed remote hash. Failed freshness lookup blocks without silently using the stale ref.                                                   |
| A02 | Primary checkout is dirty/on another branch; preparation preserves its branch, index, source edits and unrelated artifacts.                                                                          |
| A03 | Main advances after planning; resume still uses the frozen hash. A version change requires a successor candidate.                                                                                    |
| A04 | Missing tool, wrong key or disconnected phone is reported before its dependent stage; independent targets continue.                                                                                  |
| A05 | A required check fails, is skipped, has zero expected cases or cannot run; dependent delivery does not start.                                                                                        |
| A06 | Two targets share identical inputs; common verification/builds run once. Different build/signing modes do not reuse incompatible artifacts.                                                          |
| A07 | Old release directories contain nested DMGs/apps; Electron inventory checks reject their inclusion and retain required native dependencies/resources.                                                |
| A08 | Package checks pass but native WebRTC loading or Quit fails; Electron target remains incomplete.                                                                                                     |
| A09 | Chrome directory was updated but the profile still runs an older build; target remains incomplete until loaded identity and popup checks pass.                                                       |
| A10 | Android acceptance APK belongs to another revision/flavor configuration; reject evidence reuse. Installation signature conflict preserves existing data.                                             |
| A11 | A signed AAB upload is accepted but the response is lost; resume reconciles saved remote operation/version identity instead of blindly uploading again. Unattributable remote state stays uncertain. |
| A12 | AAB upload/draft succeeds but release completion fails; `android-internal` is incomplete and resumes from the recorded draft.                                                                        |
| A13 | Artifact bytes change after a passing check; pre-delivery verification fails and affected evidence cannot be reused.                                                                                 |
| A14 | Two processes select the same destination; only the established owner mutates it. Restart reconciles interrupted writes and locks.                                                                   |
| A15 | Rerun a completed plan; no duplicate install/publication occurs. Status performs no network or mutation.                                                                                             |
| A16 | Cleanup encounters pre-existing user files/worktrees; preserve them. Required receipts/artifacts remain available after owned temporary checkout removal.                                            |
| A17 | Capture normal and failure diagnostics; secret values are absent from plans, process arguments and shareable output.                                                                                 |
| A18 | Local checks are unavailable but CI is green; report blocked local coverage. A Relay target or root is neither accepted nor required.                                                                |

Implementation acceptance requires all applicable automated scenarios plus attributable Mac evidence for each target's local build/package/runtime behavior. Live Play qualification requires a separately authorized actual internal release; until performed, record publication acceptance as not run. Visual design quality and real network reliability remain outside what these tooling regressions can prove.

## Handoff and implementation boundary

The original handoff covered all six targets and deferred implementation. A later request authorized implementation, which merged in PR #55. See the [qualification ticket](issues/11-qualify-workflow.md) for the final evidence and the remaining live Play internal publication check.

The implementation scope covers the public delivery interface, regression coverage, and setup and migration of existing local release configuration. Real credential references, destination paths, tool versions and performance thresholds come from inspected configuration and measured fixtures.
