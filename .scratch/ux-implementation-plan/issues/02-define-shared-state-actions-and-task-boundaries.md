# Define shared state, actions and task boundaries

Type: grilling
Labels: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: Codex (current session)
Parent: [Clipp UX implementation planning](../map.md)
Blocked by: 01

## Question

What minimal shared interfaces and ownership rules let the approved UI behave correctly across Electron, Chrome popup/full-page and Android during and after migration?

Resolve authoritative snapshots/subscriptions and field-scoped mutations; acknowledged pending/success/rejection and partial effects; surface capabilities; and ownership of query, scope, task stack, session drafts, focus and scroll context. Use existing UI props, runtime public state, relay editor and narrow action helpers before adding abstractions. Apply codebase-design for actual module-interface choices. Product Copy, Send, Pairing, membership and reset semantics remain unchanged.

Define the shared task/host contract for Back, Escape, Close, IME-first handling, full-screen narrow tasks and comfortable desktop dialogs. Include the scanner overlay and notification-to-Requests entry. Draft retention must survive responsive unmounts, preserve unsaved destination editors, and make no promise after destroyed popup/restart. The accepted [layout](../../ux-study/layout-state-contract.md) and [control-flow](../../ux-study/control-flow-contract.md) contracts determine behavior.

Specify Chrome full-page destination identity, reuse/new-tab behavior, context transfer, stale targets and focus while preserving exact trusted-page authorization. Settings/relay sender checks and popup-only Share Now are distinct boundaries. Choose a routing/messaging mechanism explicitly; do not silently broaden either check. Require complete state/action/error coverage before moving long tasks from popup to full-page.

Resolution should identify interface/module responsibilities, consumers and compatibility/cutover requirements with source anchors and example transitions. It must not prescribe a generic framework or rewrite unrelated core services. These contracts unblock scoped correctness, native and workspace planning.

## Comments

Claimed 2026-10-10 at the user's request to proceed with **Define shared state, actions and task boundaries**. The focused first correctness milestone is approved. This round defines shared interfaces and host responsibilities, with read-only source review and a concrete proposal for the user's decision; no application implementation or native checks.

The [shared-interface proposal](../shared-interface-proposal.md) defines runtime authority and ordered snapshots, intent-specific acknowledged actions, a UI session owner, host task/input adapters and authenticated Chrome destination handoff. Fact-finding reviewed current core/UI modules and all runtime bridges; official Chrome documentation supports the proposed Port/session-storage mechanism. Known limitations remain explicit: projections are not cross-store transactions, approval is not remote receipt, UI identifiers do not change stateless Pairing authorization, and drafts are not promised after document/runtime destruction.

Three user decisions were presented: adopt the proposed shared interfaces; choose idle-page reuse with another tab when an existing full-page task is occupied versus suspending that task for the new destination; and choose review-before-overwrite for a dirty field changed elsewhere versus explicit Save overwriting its latest value. The ticket remained claimed pending that round. Approved layout, session draft retention, popup allocation and migration priorities were not reopened.

Source audit clarified payload Copy wording in this proposal and the first-milestone asset: copying a QR payload does not invoke explicit Clip reuse/Share Now, but normal clipboard observation may still capture that text. No capture-suppression policy was approved or is added. This corrects the earlier overstatement without changing the approved action allocation or milestone scope.

Independent read-only audits also clarified that reconciliation watermarks must refer to a post-action projection; refreshed data alone cannot prove an unacknowledged clipboard/Send outcome; terminal-outcome dismissal cannot hide active Pairing recovery; scanner cancellation differs from failure; and navigation has a trusted status/retry/dismiss interface. These corrections were incorporated before the Q1–Q3 decision round. No other ticket was claimed or resolved.

## Answer

Resolved 2026-10-10 through the user's three explicit answers:

- **Q1: “Adopt the proposed interfaces (Recommended).”** Keep runtime authority, ordered state observation, intent-specific acknowledged actions, shared UI session/task ownership and native host adapters as defined in the [shared-interface contract](../shared-interface-proposal.md).
- **Q2: “Reuse idle; new tab if occupied (Recommended).”** Reuse a ready idle canonical full-page Clipp tab. If available pages have an active task/editor or pending action, open another; do not replace occupied work. Preserve exact trusted-page checks, typed destination handoff, readiness/acknowledgement, stale-target recovery and popup-only clipboard capabilities.
- **Q3: “Save overwrites latest value.”** This replaces the proposed conflict-review recommendation. Preserve dirty input on incoming updates; explicit Save overwrites the latest value of the edited fields without another prompt. Use field/entity-scoped mutations against current authoritative state so untouched fields and other relay configurations are preserved. Normal validation and missing/identity-stale target checks remain; the incoming Trust Request version guard is a distinct approval safeguard, not a same-field edit conflict.

The linked asset has been updated to these answers, including action results, draft transitions and verification criteria. Adopt its module responsibilities, consumers, example transitions and cutover requirements. A changed shared interface includes all affected bridges in its delivery slice; no blanket rewrite is required. Ordinary payload Copy still follows existing clipboard capture policy; no new capture suppression, Pairing authorization, delivery acknowledgement or operation rollback semantics are introduced.

The decision preserves the approved focused first correctness milestone, layouts, session-only draft lifetime and native coverage carryforward. It authorizes this planning contract, not application implementation, native execution, commits or release qualification. No new domain term or ADR is required.

No additional decision ticket is needed. **Scope correctness and recovery delivery**, **Plan native host integration and interaction repairs**, and **Design the durable manual identity-reset boundary** are now unblocked and remain open/unclaimed. The next frontier by map order is **Scope correctness and recovery delivery**.
