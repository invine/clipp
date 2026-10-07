# 01: Find authoritative project operations

**What to build:** Let a fresh agent find the correct project procedures and relevant source files from either checkout without traversing generated caches or private profiles.

**Blocked by:** None (can start immediately).

**Status:** claimed

Repository scope: Clipp and clipp-relay. Parent: [agent workflow specification](../spec.md). Covers AC1 and AC8, retrospective improvement 7. Test boundaries and ticket graph approved 2026-10-07; implementation has not started.

## Acceptance criteria

- [ ] Both repositories have a short entry point routing verification, runtime acceptance, operator setup, recovery, architecture decisions and coordination to authoritative references.
- [ ] Correct current glossary references and move duplicated command/runtime reference material behind pointers; retain meaningful project constraints and dated evidence.
- [ ] Provide bounded file listing and content lookup for an explicitly selected repository/scope, including explicit nonignored task files while excluding nested worktrees, caches, dependencies, outputs, recovery and private profiles by default.
- [ ] The CLI reports truncation and malformed/missing roots, handles spaces and unusual filenames, and neither mutates files nor executes source text.
- [ ] Public-command tests with synthetic excluded canaries prove useful source results, bounded output and no excluded content. Maintained navigation links resolve.
- [ ] A fresh-context walkthrough from each entry point locates verification, acceptance, recovery and the canonical tracker without a recursive search of local artifacts.

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
