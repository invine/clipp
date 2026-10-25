# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

## Establish ownership

Before creating a plan, specification or tickets, choose one owning repository and canonical `.scratch/<feature-slug>/` directory. Its README identifies that owner and each participating repository's responsibility. Each companion repository keeps a README pointer to that directory, resolved against explicit repository roots; claimable tickets belong only to the owner.

Keep a compact `decisions.md` beside the specification: decision ID, source, disposition and specification requirements. Retain superseded proposals when their absence would make the accepted decision ambiguous. Review every accepted decision for coverage. The [v2 ownership contract](ledger/ownership-v2.md) defines mechanically checked references and the existing status CLI integration; semantic completeness remains Spec review work.

Keep mutable run records and private evidence outside disposable worktrees and Git. Tracked references use repository roles and relative paths; the local configuration supplies roots and artifact locations. Existing auth/logging ownership and historical records stay in place; apply this convention to new efforts rather than migrating history.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
