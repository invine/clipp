# 01: Find authoritative project operations

**What to build:** Let a fresh agent find the correct project procedures and relevant source files from either checkout without traversing generated caches or private profiles.

**Blocked by:** None (can start immediately).

**Status:** resolved

Repository scope: Clipp and clipp-relay. Parent: [agent workflow specification](../spec.md). Covers AC1 and AC8, retrospective improvement 7. Test boundaries and ticket graph approved 2026-10-07; implementation and validation are recorded below.

## Acceptance criteria

- [x] Both repositories have a short entry point routing verification, runtime acceptance, operator setup, recovery, architecture decisions and coordination to authoritative references.
- [x] Correct current glossary references and move duplicated command/runtime reference material behind pointers; retain meaningful project constraints and dated evidence.
- [x] Provide bounded file listing and content lookup for an explicitly selected repository/scope, including explicit nonignored task files while excluding nested worktrees, caches, dependencies, outputs, recovery and private profiles by default.
- [x] The CLI reports truncation and malformed/missing roots, handles spaces and unusual filenames, and neither mutates files nor executes source text.
- [x] Public-command tests with synthetic excluded canaries prove useful source results, bounded output and no excluded content. Maintained navigation links resolve.
- [x] A fresh-context walkthrough from each entry point locates verification, acceptance, recovery and the canonical tracker without a recursive search of local artifacts.

## Implementation context

Use the [source inventory](../README.md#existing-sources-to-reuse). Extend existing documentation before creating overlapping guides. Scope this ticket to navigation and lookup; ticket 02 owns the decision/dispatch procedure and ticket 05 owns live Git/ticket status. Documentation targets supplied by later tickets may be attached during those tickets; this ticket must not introduce broken links to nonexistent files.

Use TDD for CLI behavior and direct link/walkthrough checks for documentation. Preserve existing worktrees and profiles. Do not edit personal/global skills.

## Comments

- Planning publication only; no claim or implementation evidence yet.

## Coordinator dispatch — 2026-10-07

Owner: navigation-01; coordinator: agent-workflow-20261007.

Requested outcome and invariant assessment: Find authoritative project operations and provide bounded read-only lookup. Preserve accepted product behavior, glossary vocabulary, historical evidence, profiles and existing worktrees. Accepted ADR 0012 remains unchanged; no new architecture decision is needed.

Decision reference: [accepted fallback ADR](../../../docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md). Test seams: approved public CLI/subprocess and navigation boundaries in the parent specification.

Integration branches: `codex/agent-workflow-integration` in each participating repository. Local preparation only; maximum two implementers. Coordinator owns claim, integration and resolution.

## Answer

Implemented bounded read-only source listing/search and short operational navigation in both repositories. Current glossary pointers are corrected without changing the accepted fallback decision or dated evidence.

Source client `ce42c17a0f2a572091ceb3d44dfdb17a09131983` integrated as `a4bb66af52a4b994113756db82619447df1de261`; source relay equals integrated `19967ddd7021170504192642f67e13efb3436eb2`. Integration preserves newer coordinator metadata. Client check passed 77 suites/660 tests; six CLI tests passed at the integrated revision, 48 maintained links and four bounded lookup walkthroughs passed across both roots. Focused Standards/Spec assessments and merger scope checks have no outstanding findings; final whole-effort review remains required.

[Evidence index](../run.md#dispatch-and-evidence): local artifacts `ticket-01-receipt.json`, `ticket-01-integration-receipt.json` and `ticket-01-integration-navigation.json`; exact commands/revisions are recorded there. Native/live and hosted acceptance remain not run. Existing worktrees/stashes/private runtime data remain retained.

Final whole-effort acceptance: [review record](../review.md); exact current revisions and artifact availability are checked by the durable local ledger, rather than treating earlier receipts as current checkout truth.
