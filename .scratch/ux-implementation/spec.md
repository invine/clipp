# Clipp UX implementation

Status: approved implementation plan — accepted 2026-10-10
Date: 2026-10-10
Repository role: client
Execution: not started; all implementation tickets unclaimed

## Outcome and entry point

Implement the approved Clipp UX across Electron, Chrome toolbar popup, Chrome full-page management and Android through small verifiable changes. Deliver correctness and usable controls first, then the compact workspace, then additional controls. The first checkpoint is **Reliable state and recoverable actions on existing surfaces**, beginning with Chrome preference integrity.

This specification consolidates the accepted [planning decisions](../ux-implementation-plan/map.md) and completed [UX handoff](../ux-study/handoff.md). The user accepted the final plan on 2026-10-10; the [final planning resolution](../ux-implementation-plan/issues/07-finalize-validation-and-implementation-backlog.md#answer) records acceptance of this backlog and its evidence gates. Prior approvals remain authoritative. Planning is complete; implementation has not started.

Start with this document, the selected individual ticket, its linked package contract and relevant coverage rows. The [ticket index](backlog.md) provides named dependencies. [Traceability](traceability.md) covers all 51 findings, three additions, six study categories and 23 scenario families. [Validation coverage](validation-coverage.md) assigns each carried qualification. The machine-readable [catalog](catalog.json) supports validation; individual ticket Status/Assignee/Blocked by fields remain the canonical execution state. No separate status is maintained in the catalog.

## Accepted inputs

| Input | What it settles |
| --- | --- |
| [First milestone and migration](../ux-implementation-plan/first-correctness-milestone.md) | Small independently verifiable steps, first six repairs, compatible old surfaces until cutover. |
| [Shared interfaces](../ux-implementation-plan/shared-interface-proposal.md) | Runtime authority, ordered snapshots, truthful action results, one live UI session, field-scoped explicit Save, authenticated Chrome handoff. |
| [Correctness packages](../ux-implementation-plan/correctness-delivery-proposal.md) | Six milestone repairs and five remaining state/recovery/management packages. |
| [Native packages](../ux-implementation-plan/native-host-delivery-proposal.md) | Seven host packages, scanner diagnosis before remedy, real notification qualification, conditional Dock repair. |
| [Workspace packages](../ux-implementation-plan/workspace-delivery-proposal.md) | Eight component/migration packages, early readability/access/theme, functional Chrome parity before retirement, real policy controls. |
| [Manual reset](../ux-implementation-plan/manual-identity-reset-proposal.md) | Five packages, durable same-candidate roll-forward manual recovery, strict host storage/ingress, one former-ID reminder until dismissal before another reset. |
| [Layout contract](../ux-study/layout-state-contract.md) and [control contract](../ux-study/control-flow-contract.md) | Selected visuals, surfaces, task behavior and destructive-action consequences. |

Accepted terminology comes from [the glossary](../../GLOSSARY.md); implementation follows the [architecture map](../../docs/agent-guide.md) and applicable [ADRs](../../docs/adr/). An execution issue scopes work and tests; it does not override its linked accepted contract. If source has changed or an invariant genuinely conflicts, record the exact conflict and resolve only that branch through the project decision checkpoint.

## Delivery order and completion

There are 31 original execution tickets corresponding to the approved 11 correctness, seven native, eight workspace and five reset packages, plus two numbered delivery refinements: [local assets and Android shared controls](issues/32-deliver-local-assets-and-android-shared-controls.md) and [the compatible Pairing outcome interface and Electron journey](issues/33-deliver-pairing-outcome-interface-and-electron-journey.md). File numbers are identifiers, not a requirement to execute numerically. Hard dependencies name required completed outputs; do not turn every integration contributor or evidence collector into a predecessor.

1. **First milestone:** [Chrome preferences](issues/01-repair-chrome-preference-integrity.md), [History reconciliation](issues/02-reconcile-authoritative-history.md), [Clear review](issues/03-confirm-clear-all-history.md), [retained edits](issues/04-retain-name-and-alias-edits.md), [immediate Pairing results](issues/05-report-immediate-pairing-results.md) and [QR/Copy results](issues/06-report-qr-and-payload-copy-results.md). Preserve working surfaces and verify the corrected action is reachable on each claimed surface. Broader terminal/native/new-layout qualifications keep their later owners.
2. **Remaining correctness and access:** session recovery, issue composition, ordinary Chrome capture recovery, terminal Pairing outcomes and complete management; Android bounds/input/scanner/notifications; local controls/styles, working themes, visible navigation/Search/pending access and minimum reflow. Real retention/lifetime can accompany replacement of obsolete settings as already approved. No first milestone depends on sign-in, complete compact screens or manual reset.
3. **Compact workspace:** final History/details density, S2, M1 Devices and M3 Settings, with native continuity control presentation. Alias clearing accompanies Devices. Reuse the already functioning state/actions/tasks. Correctness affecting an area must pass before calling that area's compact replacement complete. A blocked unrelated native qualification does not stop independent work; its own portion remains unqualified.
4. **Additional controls:** tray cleanup/conditional Dock repair and durable manual reset. Small related tray or continuity-state fixes may accompany earlier work where the accepted plans allow it. They cannot displace unresolved urgent correctness work.

The coordinator applies that priority policy at dispatch in addition to the dependency graph. Independent preparation can proceed without inventing sequencing edges. The implementation run, once authorized, may use at most two implementers under the project workflow; this planning session creates none.

**Cross-runtime blockers:** as written, a hard predecessor must be resolved before claiming its consumer. An open predecessor's partial host result is not an implicit exemption. If one host's external/native qualification would unnecessarily hold another host's usable output, the coordinator may refine the affected ticket into independently integrated, verifiable host scopes before dispatch. Create a separate numbered issue for the deliverable being consumed, retain all remaining host work and gates in the original/residual issue, update names, Blocked by edges, catalog and traceability, and record the scope-preserving split. The consumer then depends on the genuinely completed scoped issue. This is permitted delivery refinement under the approved small-step strategy, not permission to waive evidence or mark a whole cross-runtime package complete. Shared-contract changes still include every affected live bridge; a split cannot leave incompatible consumers. Changes to accepted behavior or required qualification still need the decision checkpoint.

The assets/control package is allocated between [local assets and Android shared controls](issues/32-deliver-local-assets-and-android-shared-controls.md) and [remaining desktop qualification and cross-surface collection](issues/17-unify-local-assets-and-shared-controls.md). Themes, navigation and native input consume the completed issue 32 interface/Android scope. Residual issue 17 retains its required desktop gates, including G13/G14; each consumer also retains every affected gate in its own scope. This allocation supplies no qualification by itself.

**Ticket completion:** the scoped output is implemented, integrated and verified through its required gates. **Finding closure:** the designated collector has all required supporting outputs and candidate evidence in the traceability ledger. These are separate. A completed foundational ticket is not kept open waiting for its descendants, and its finding is not marked fixed early. For example, assets can complete before final C15 visual integration; Clear can complete before Advanced relocation; native Back can complete before scanner-specific Back is collected.

Maintain a candidate-bound evidence record per ticket and a separate closure status per finding/addition. The coordinator owns those updates. An external or retained qualification can remain explicitly unverified under its accepted scope, but a required candidate gate cannot be converted to retained merely to finish. If required evidence cannot be obtained, record the exact unresolved portion and keep that claim/ticket incomplete, or seek a concrete scope decision; do not silently waive it. Diagnosis tickets can finish with a reproducible supported conclusion or explicit blocker report, but the blocked remedy/support claim stays unavailable.

## Preserved contracts

- Cross-runtime behavior belongs in `packages/core`; shared UI/session/presentation belongs in `packages/ui`. Runtime/main/background/client remains authoritative. Every action-surface change includes all affected live bridges/consumers. Electron main/preload stay CommonJS with relative shared imports; Chrome networking spans background and offscreen.
- Ordered public snapshots carry authority session/revision and reject stale reads/replies. No second product store in the UI. Actions report real applied, partial, rejected or unconfirmed outcomes; reconciliation is not universal rollback. Keys, credentials and native handles never enter public state.
- One UI session retains query/scope, drafts, task and logical focus/scroll across layout changes while its document lives. Back/Close retain ordinary drafts; Cancel/Discard clears. Explicit Save overwrites only edited fields without conflict review; incoming approval's request-envelope guard is a separate safety condition. No destroyed-popup/restart draft guarantee.
- Chrome uses an exact canonical full-page URL with authenticated destination messages. Reuse idle ready tabs; open another if occupied. Preserve trusted sender checks, stale-target recovery and current work. Full-page cannot acquire popup-only Send or focus capture. Functional state/action/error/draft/focus parity precedes retiring popup management.
- Keep the approved Clipp/status line above Search, compact Send/Filters and named Copy/Pin icons; Delete is in details. Narrow rows, top-aligned equal-height wide cards, no masonry/permanent sidebar or duplicate wide All/Pinned. Full content stays inspectable. Devices uses M1 text statuses; Settings uses M3. S2 uses the original direct triangle and honest unknown/fault states; Auto Sync and delivery are separate.
- Pairing and Admission retain signed-stateless protocol semantics. Local approval is not response delivery; dismissal is not request cancellation. Device Revocation remains permanent remove-wins membership, not merely hiding a row. Empty managed-relay defaults and accepted one-retained-session fallback stay intact.
- Clear includes all local history/pins/filtered entries, with review and no Undo; single Delete stays immediate. Chrome session pinning remains a capability limit. Retention and Clip Sharing Lifetime stay distinct, with immutable existing Clip metadata and fixed pending-event semantics.
- Manual reset follows the accepted durable design: no destructive cleanup before accepted intent; unknown acceptance is reconciled; one candidate, sealed old local work/capture, mandatory receipt and replay guard, completed cleanup before activation. Preserve installation settings/configuration/saved credentials, normal clipboard baseline and automatic rotation's distinct recovery/notice rules. No clipboard erasure, forensic promise or predecessor network revocation. Keep one former-ID reminder until explicit dismissal before another manual reset; automatic rotation never waits for it.

No glossary change, protocol expansion, account-switch feature, OS key-store migration or relay-server implementation is implied by this plan.

## Integration and activation boundaries

| Boundary | Required gate |
| --- | --- |
| Ordered state and shared actions | Introduce with a corrected real consumer; adapt each affected live host before changing the contract. Retire legacy reads/callbacks only after their consuming paths are replaced. |
| Session/task foundation | Clear/editor first consumer provides usable task primitives; session package extends the same owner. Native geometry can land against the existing consumer, then responsive navigation adopts it. |
| Native Back and scanner | Generic task input qualifies against existing tasks. Scanner integrates the abort/Back hook later and owns its additional real-camera evidence; no mutual dependency. |
| Chrome full-page management | Co-deliver minimum functional details/Requests/settings consumers using accepted components. Later density/M1/M3 packages refine them. Do not wait for those final cosmetics or remove popup paths before full parity/handoff passes. |
| Scanner remedy | Provider diagnosis supports the selected remedy; actual candidate verification precedes enabling its claimed provider path. Missing environment evidence stays scoped. |
| Reset action | Core/storage/runtime and authenticated UI form an integrated candidate behind per-runtime availability. The separate fault/restart qualification then permits enabling each proven runtime. UI cannot require its own later qualification as a predecessor and create a cycle. |

Reuse existing handlers and domain modules; avoid a generic command bus, duplicate router or stand-alone abstraction change with no corrected consumer. Small internal commits are allowed within a ticket, but a passing helper with the old broken call path still active does not satisfy it.

## Verification and evidence

Use npm and Node ≥22.22.1 (current repo pin 24.16.0). Run meaningful affected tests while implementing, then [routine verification](../../docs/agents/verification.md) on the integrated candidate: `npm run verify` includes lint, all-runtime typechecks/Jest and the three production builds. Run `npm run check` before any future code commit. Do not repeatedly broaden tests after a pass without new changes or a concrete concern. Native changes additionally need applicable native build/sync/instrumentation; an Android web build is not native acceptance.

Each ticket receipt records repository role, full revision plus dirty-state hash, build/tool versions, changed paths, focused tests, common gates, UI/native environment and result per required case. Label fixtures, actual native input, physical hardware and human observations distinctly. Include failures, unavailable prerequisites and not-run cases; a command exit, screenshot or approval alone does not prove behavior it did not exercise. Update selectors to accessible icon names where changed; the existing clipboard script's popup-as-tab fixture cannot qualify real toolbar-popup lifetime and writes the global clipboard.

Use the accepted [layout matrix](../ux-study/layout-state-contract.md#implementation-acceptance-matrix) for each affected consumer, with representative combinations plus its smallest/shortest/enlarged/task extremes:

- 320px, ordinary phone, landscape, 340×350 short window, restored/wide/maximized/fullscreen and exit/restore; actual toolbar popup and complete full-page Chrome.
- Default, intermediate and 200% text/zoom plus supported spacing overrides; no horizontal page overflow, lost action association or shrinking user text. Full long Clips/names/IDs/endpoints/errors remain deliberately reachable.
- Editors/Paste/QR/scanner with real native IME and safe bounds; native Back/focus entry/return and last action reachable. Record dp/density/insets, physical/content/window sizes and CSS pixels separately.
- Empty/no-match/dense/pending/offline/recovery, simultaneous issues, failed Save/repeated Retry/rejected approval/QR failure; verify actual state, retained drafts and honest outcomes.
- All themes/offline assets/selected contrast, named keyboard/touch controls and measured 40px pointer/48dp Android intent. The approved prototype provides direction, not evidence for the implementation.

The [coverage ledger](validation-coverage.md) supplies the precise Candidate/External/Retained disposition for each gap. Required native Pairing, notifications, focused clipboard recovery and new reset durability need actual candidate evidence. Do not repeat the entire historical study for every small edit; execute the affected scenario/profile and retain all required outstanding claims. Final integration collects the four-surface matrix and broad findings after their contributors exist.

Real clipboard checks need a new isolated synthetic-marker interval; prior clipboard gates are off. Global display/permission changes need their own coordinated interval; the prior display mode is restored. Real sign-in remains user-deferred and must not restart without their request. Unavailable external display/native 1×, VoiceOver and accepted Android assistive/physical/OEM gaps retain their explicit limits. No data-mutating fixture is installed in an operator app/profile.

## Existing external ownership

Client owns this backlog. Preserve the resolved extension clipboard architecture. [Restart recapture](../extension-clipboard-io/issues/02-prevent-restart-recapture.md) and [content-script capability](../extension-clipboard-io/issues/03-align-content-script-capture-capability.md) retain their existing owners; link only actual consumed prerequisites. Reset restart/baseline qualification must reconcile the former before claiming Chrome safety.

Managed-relay runtime/auth/interoperability qualification belongs to the existing relay-repository tickets linked in the coverage ledger. Controlled UI failures do not close them. The current companion checkout is `/Users/invine/src/go/clipp-relay`; resolve its role/root explicitly in a future run. No relay integration baseline, source change or authorization is implied here. Account deferral does not block unrelated UI/action tests.

## Execution handoff and authorization

The plan is accepted. A separately authorized execution run starts from [project operations](../../docs/agents/operations.md) and [workflow](../../docs/agents/workflow.md). The coordinator must:

1. Refresh HEAD/branch/dirty paths/worktrees/stashes/required ignored artifacts and inspect source drift. The planning baseline was client `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`, with two unrelated modified managed-relay-auth files recorded in the [baseline receipt](../ux-implementation-plan/planning-baseline.json). Never reset or overwrite them; dated hashes are not a future baseline.
2. Record run ID, client root, current integration branch/full hash, relevant external blockers, exact authorized operations and applicable gates. No inherited commit/push/deployment/native/account permission from an old run. Existing workflow examples describing a local-commit run do not authorize this planning turn.
3. Claim one eligible ticket before dispatch, with requested behavior, glossary/ADR invariants, predecessor outputs and gap rows. Use isolated `codex/` branches/worktrees per changed repository; preserve existing artifacts and honor the two-implementer bound. No second canonical claim tracker.
4. Integrate against current inspected tips, preserve evidence outside disposable worktrees and run applicable candidate checks. Complete Standards and Spec review against the fixed baseline under project workflow; fix actionable failures before resolution.
5. Resolve scoped implementation tickets and update finding/addition evidence separately. Keep missing required gates unqualified and external owners unchanged. Final handoff states what is implemented, tested and still unqualified; it cannot imply release readiness, hosted CI, publication or deployment.

This plan itself runs no application tests or native journey and changes no production source. Its validation checks document links, dependency consistency, allocation completeness and unchanged planning inputs. All execution tickets remain open and unclaimed for a separately authorized implementation run. The first delivery is [Repair Chrome preference integrity](issues/01-repair-chrome-preference-integrity.md).

## Existing-task host delivery refinement — DRAFT 2026-10-14

Proposed additions34 and35 follow the approved cross-runtime rule and the Native Back/scanner and Chrome full-page integration table. They allocate existing31 original packages plus32/33 foundations without adding runtime findings or prescribing an execution order. [34](issues/34-deliver-android-electron-task-input.md) consumes genuinely completed07/12/32 and qualifies Android/Electron input against existing tasks; the whole19 package is not required for that bounded output.19 remains responsible for full navigation/reflow and all original gates. [35](issues/35-deliver-chrome-management-and-task-input.md) consumes completed02/03/06/07/08/32/33 and co-delivers Chrome13 task input with complete management; every scoped native/control/Pairing/cutover gate remains required, including unavailable Chrome G01.13/11 remain original collectors and retain all residual contributions from15/16/17/19/10 and later consumers.32 is no desktop qualification and33 is no Chrome Pairing pass. Root must accept this allocation and reconcile issue fields/catalog/backlog/traceability/coverage before claim. Source-only delivery cannot resolve the scoped issue or close a finding. All preserved contracts, common gates and Candidate/External/Retained dispositions remain unchanged.
