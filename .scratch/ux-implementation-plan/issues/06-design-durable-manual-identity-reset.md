# Design the durable manual identity-reset boundary

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session)
Parent: [Clipp UX implementation planning](../map.md)
Blocked by: 02

## Question

How will the approved voluntary Generate new identity operation obtain durable acceptance, recover across failures/restart and present the former public ID across all runtimes without weakening existing Identity Rotation guarantees?

The product decision is settled in the [control-flow contract](../../ux-study/control-flow-contract.md#generate-new-identity) and constrained by [Identity Rotation](../../../docs/adr/0004-use-peer-id-as-membership-identity.md). Decide the shared core lifecycle, persistence/commit boundaries, runtime shutdown/restart adapters, authoritative UI states, duplicate prevention, receipt lifetime and failure seams. Reuse compatible automatic rotation logic, while recognizing that it lacks the voluntary intent/receipt contract.

Distinguish failed start from durably accepted incomplete reset. Persist the former public ID without retaining old keys/Membership View or identity-bound presentation state. Keep the replacement inactive until required cleanup commits; resume accepted work without generating new candidate identities on every retry. Preserve installation preferences/configuration, ordinary clipboard baseline rules and the separate old-device revocation explanation. Do not invent Undo, network-wide revocation, account continuity or system-clipboard erasure.

Resolution should yield a reviewed state/transaction design, per-runtime bridge/storage responsibilities, failure/restart acceptance cases and proposed implementation slices in the additional-controls band. It does not authorize executing a reset, changing profiles or altering accepted automatic revocation semantics. New schema details should be grounded in source inspection, not guessed in charting.

## Comments

Claimed 2026-10-10 after the workspace delivery approval, continuing under the user's request to work until another concrete confirmation is needed. The product consequences and Advanced placement are settled. Inspect core/storage/runtime seams and prepare the durable acceptance/recovery design before presenting any remaining choice. This is planning only: no reset, profile access, clipboard/native action or production code change.

The [manual reset proposal](../manual-identity-reset-proposal.md) defines a single transition owner, durable acceptance with a validated candidate and former public ID, roll-forward manual recovery, completion/receipt finalization, runtime fences and five delivery packages. It preserves automatic rotation's separate recovery and optional-notice semantics. Read-only source investigations identified Android fallback durability/native ingress and Chrome offscreen/late-write paths as explicit implementation prerequisites. The remaining proposed product choice is former-ID reminder lifetime and repeated-reset behavior; the draft recommends one reminder until dismissal, with disposition before another manual reset. Neither that recommendation nor the transition proposal is approved yet.

Three read-only proposal audits covered core transactions, runtime/native integration and accepted-contract consistency. The finalization sequence now explicitly requires both receipt and completed-operation guard before removing the recovery marker, including failure/reopen checks between those writes; the identity-storage ADR link was corrected. No remaining audit blocker was found. Document links/anchors, all 145 inventoried source hashes, six study inputs and the two pre-existing tracked changes were checked unchanged or valid. No application test or native/reset action ran. The two questions are adoption of this transition/delivery design (including suspended old local work and roll-forward manual recovery) and the former-ID reminder policy. The ticket stays claimed pending the user's answers.

## Answer

Resolved 2026-10-10 after the user selected **“Adopt the reset design (Recommended)”** and **“One reminder; dismiss before another reset (Recommended)”**. Adopt the [durable manual reset design](../manual-identity-reset-proposal.md) and its five delivery packages for final consolidation.

One core transition owner serializes manual and automatic rotation. Manual acceptance durably records the validated replacement candidate and former public ID before destructive cleanup. Accepted manual recovery suspends old-identity local work/capture and rolls forward with the same candidate; it never restores the old runtime or generates another identity on retry. Required cleanup, public receipt and completed-operation guard precede finalization/activation. Every host fences late work and startup; Android strict persistence/native ingress and Chrome offscreen/storage wake paths are explicit prerequisites. Existing automatic safety, revoked local-only recovery and best-effort notices remain unchanged.

Retain one completed former-ID reminder in Advanced/completion until explicit durable dismissal, without time expiry. Copy is optional; dismissal does not mean the former identity was revoked. Another manual reset requires disposition of this reminder first. Automatic rotation never waits for it and preserves it with an accurate past-manual-reset label. Dismissal removes the former-ID receipt, not minimal bounded replay metadata, and cannot dismiss an incomplete operation or a newer receipt.

The approved consequences, offline review, separate revocation explanation, normal clipboard baseline and preservation ledger remain intact. No reset, native test or production change ran. No new decision ticket emerged. Continue to [Finalize validation gates and the implementation backlog](07-finalize-validation-and-implementation-backlog.md) under the user's standing instruction to proceed until another concrete confirmation is needed.
