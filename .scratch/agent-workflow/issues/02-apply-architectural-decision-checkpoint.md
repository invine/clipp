# 02: Apply the architectural decision checkpoint

**What to build:** Make project implementation and review distinguish work within accepted decisions from a proposed architectural change before agents are assigned.

**Blocked by:** [01: Find authoritative project operations](01-find-authoritative-project-operations.md).

**Status:** ready-for-agent

Repository scope: both projects; canonical procedure in Clipp. Parent: [agent workflow specification](../spec.md). Covers AC2 and the workflow portion of AC6, retrospective improvement 1. Test boundaries and ticket graph approved 2026-10-07; implementation has not started.

## Acceptance criteria

- [ ] The project procedure records the requested behavior, relevant accepted decisions and a concise assessment of affected invariants before dispatch.
- [ ] Work preserving accepted decisions proceeds without redundant approval. A change to an accepted invariant waits for an explicit user decision, with its accepted record linked before dispatch; unrelated eligible work continues.
- [ ] The transport example correctly permits full setup fallback under the accepted single-session ADR and withholds persistent concurrent Relay Sessions pending a separate accepted decision.
- [ ] Define the coordinator's claim/integration/resolution ownership, fresh ticket context, two-implementer maximum, one integration branch per participating repository and preservation requirements.
- [ ] Spec review checks scope and decision evidence against actual behavior. Standards review handles judgment; any mechanical checks introduced use deterministic validation instead of prose-only rules.
- [ ] Define evidence for integration, verification, review and resolution, plus recovery from inconsistent state; ticket 05 can implement the procedure without inventing a competing ticket lifecycle.
- [ ] Both project entry points reach this procedure. Review the two architectural scenarios and record their outcome without introducing tests tied to exact wording.

## Implementation context

Use the [source inventory](../README.md#existing-sources-to-reuse) and accepted fallback ADR. This is a project workflow layered onto the available implementation/review skills, not a personal skill fork. A schema or checker can enforce presence and references, not determine semantic ADR compliance. Keep automation of current status for ticket 05.

## Comments

- Planning publication only; no claim or implementation evidence yet.
