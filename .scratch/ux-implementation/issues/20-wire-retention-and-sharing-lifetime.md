# Wire local retention and Clip Sharing Lifetime

Type: implementation
Status: claimed
Assignee: ux-retention-20
Priority band: 1
Blocked by: 01, 02, 32
Dispatch: authorized UX implementation run `ux-implementation-20261010`; claim in [run record](../run.md)
Parent: [Clipp UX implementation](../spec.md)

## Outcome

Local retention and Clip Sharing Lifetime each control their stated, different behavior.

## Work and boundaries

Use validated persisted settings through every runtime, existing History policy and runtime Clip factory. Replace obsolete Chrome Expiry after its early removal. Show actual persisted nonpreset values; document zero/default/max semantics from accepted source, retaining 30-day maximum sharing lifetime.

Retention affects local storage and respects pins; lifetime sets immutable shareExpiresAt only for new events, including explicit/native paths. Pending capture retries reuse event lifetime. Existing/imported Clips unchanged; no capacity control or lifetime-as-deletion.

The [approved package contract](../../ux-implementation-plan/workspace-delivery-proposal.md#real-local-retention-and-clip-sharing-lifetime) is normative detail for this ticket. Preserve the [shared interfaces](../../ux-implementation-plan/shared-interface-proposal.md) and [specification invariants](../spec.md#preserved-contracts). Update every affected live runtime bridge with its consumer; do not leave a successful helper behind a broken caller.

## Dependencies and integration

- [Repair Chrome preference integrity](01-repair-chrome-preference-integrity.md) — consume its completed, scoped output.
- [Reconcile authoritative History and queries](02-reconcile-authoritative-history.md) — consume its completed, scoped output.
- [Deliver local assets and Android shared controls](32-deliver-local-assets-and-android-shared-controls.md) — consume its completed compatible asset/control interface.

Only the output scoped here must be complete to resolve this ticket. Later consumers requalify their changed presentation; broad finding collection is separate and cannot block this ticket on its own descendants. Follow [phase admission](../spec.md#delivery-order-and-completion) rather than treating file numbers as an execution sequence.

## Verification and acceptance

Assert emitted Clip fields for all creation paths, default/max/invalid settings, restart, retained custom values and pending retries. Assert actual local cleanup/pin/unpin/failure effects and current views, not merely stored preferences.

Run the [common candidate gates](../spec.md#verification-and-evidence) plus affected suites/builds/native checks. Record exact revision/dirty state, environment, commands and actual outcomes. Preserve regressions through the owning interface; use rendered/native evidence for the behavior that requires it, not implementation-mirroring helper tests.

## Coverage and closure

Candidate policy/persistence tests; external transfer enforcement qualification stays with existing interop owner. This completes C02 only with early removal evidence.

The [coverage ledger](../validation-coverage.md) specifies Candidate, External and Retained dispositions and fresh native intervals. Required missing evidence leaves the affected portion unqualified; report it explicitly. No old observation or planning approval is a pass. Primary finding collector: C02 Full finding closure requires all [traceability contributions](../traceability.md), not merely this ticket's completion. Separate additions keep their own names and are not counted as new runtime findings.

## Source anchors

- [clipboard.ts](../../../packages/core/runtime/clipboard.ts)
- [store.ts](../../../packages/core/history/store.ts)
- [main.ts](../../../apps/electron/src/main.ts)
- [background.ts](../../../apps/extension/src/background.ts)
- [client.ts](../../../apps/android/src/client.ts)
- [backendConformance.ts](../../../tests/core/history/backendConformance.ts)

## Handoff

Coordinator records the fresh baseline/claim, accepted decision assessment, isolated worktree, integration revision, checks and Standards/Spec review under [project workflow](../../../docs/agents/workflow.md). Preserve unrelated work. No code, native operation, commit, push or deployment has occurred for this planning ticket.

## Dispatch assessment — 2026-10-12

Consume the genuinely resolved compatible asset/control foundation in32 instead of residual desktop qualification17. This follows the approved numbered refinement already used by13/18/19; it changes no output or required gate. Residual17 retains all desktop control/G13/G14 and styling collection. Ticket20 retains every affected current presentation, emitted Clip, cleanup/pin/suppression, persistence, restart and simultaneous-view G35/G36 check. A prior host result is not a pass for changed consumers.

Predecessors01/02/32 are resolved. Requested retention and Clip Sharing Lifetime preserve the accepted Clip/History distinction, immutable imported/previous metadata, event-fixed pending lifetime, truthful partial effects, runtime authority and ADR-0012. Default/zero/max/custom semantics remain the accepted package contract; no capacity/forever setting or migration from obsolete expiryDays is introduced.

Coordinator claim `ux-retention-20`: client branch `codex/ux-20-retention-lifetime`, isolated worktree `/Users/invine/src/js/clipp/.local/ux-implementation/worktrees/ticket-20`, based on this claim commit. Read current preparation `/private/tmp/clipp-ux-implementation-20261010/ticket-20-current-prep.md`; use owning-interface TDD and update every live bridge with each shared action-surface change. Root serializes broad/native/rendered checks, review and integration. No host clipboard, native SDK/OS changes, real sign-in, external relay work, push or publication is assigned. At most two source implementers. Required native/persistence/current-view gates remain incomplete until measured and reviewed.

## Reviewed durable reopen acceptance — 2026-10-15

Source acceptance commit82f6902cb6225f38133dcf073b8e3dcae60536e4 is integrated through mandatory merger55870d7dae378cfef9b88aa620ae725864a79bac. The new test closes and reopens a real on-disk SQLite database twice, reconstructing the actual settings/retention/History owners and production Electron clipboard factory. It observes exact5001/7003ms emitted deadlines, immutable imported metadata and original local age, saved custom retention, pins, Unpin and durable removal suppression. Product behavior is unchanged by this test increment. Both Standards and Spec pass; fresh integrated npm run verify passes139 suites/962 tests, all typechecks and all three production builds, lint0 errors/833 existing warnings.

Evidence: ignored run directory tickets-20-resumed-current-source-evidence.json, ticket-20-resumed-closure-handoff.md, tickets-20-26-source-{standards,spec}-review.md, tickets-20-26-merge-receipt.json and tickets-20-26-integrated-verification.json. Reconstruction is not actual native process restart. Required current Chrome simultaneous-view/worker G36, Android native ingress/pending/restart and affected presentation G35/G36 remain unqualified. Existing required G14/Chrome G01 and external deferrals remain unchanged. Ticket20 stays claimed.

## Remaining source lifecycle dispatch — 2026-10-16

Continue existing claim from clean integration `9a331ff93c43fec62771b412e3a11ac8f738aded`; named predecessors remain resolved. Retention cleanup source lifecycle: stop must retire timer/manual admission and ignore late completion/failure notifications so an old owner cannot publish stale cleanup state into a resumed runtime. Prove through existing startHistoryRetentionCleanup public seam, including deferred completion and real History where useful. Retention/pin/suppression/lifetime semantics and existing result contracts remain unchanged.

Two fresh isolated implementers maximum, retained ticket-20 branch/worktree fast-forwarded from its inspected clean prior tip. Approved public owning-interface TDD seams and standing approvals persist. Root owns broad-check serialization, integration, two-axis review and fresh verification. Preserve ADR0012, existing worktrees/stashes/dirty files, every failed/unqualified native gate and deferral. No native/CUA/SDK/browser/clipboard operations, harness preparation, repeated approval request, consumer claim across hard dependency or source-only ticket resolution.
