# Compact current recovery

Use this format when resuming an effort or adopting the delivery workflow. The
canonical feature README links one `current.json` in the same directory. That
pointer identifies the selected run and candidate; numbered tickets remain the
source of status, dependencies and ownership. Planning snapshots link back to
this entry and label themselves archival.

```sh
node scripts/agent-status.mjs --entry client:.scratch/FEATURE/current.json --local LOCAL.json --compact
```

Add `--json` for the same derived fields as JSON. Use `--ledger RUN.json --local
LOCAL.json --compact` while preparing a migration or reading historical v1/v2
records. Omit `--compact` for the full inventory. The CLI reads the entry as a
bounded public JSON file, resolves its run artifact through local configuration,
and uses the existing status and v3 applicability evaluator. Recorded commands
remain descriptive text.

## Current pointer

Copy [the entry template](current.example.json) to the canonical feature directory
as `current.json`, replacing every example value. It uses [entry schema
v1](entry-v1.schema.json). Each configured repository root must select its active
integration worktree and match the ledger's integration branch and tip. The entry's
canonical directory, run ID and branches must match the selected ledger. Its
candidate ID must equal the v3 ledger's `selectedCandidateId` and name a candidate
whose source revisions are integrated by ancestry or an explicit verified mapping.
V3 `repositories` selects a nonempty subset of `client` and `relay`; ownership
roles, local roots, entry branches and candidate revisions cover exactly that
subset. Client-only efforts configure only `client` and require no relay checkout.
Historical v1/v2 runs retain their required two-role contract.

Keep the run ledger and local configuration outside disposable worktrees. The
local `artifacts` map resolves `runArtifact` to the absolute ledger
file. V3 may use [local schema v2](local-v2.schema.json) for the configured subset;
two-role v3 records may continue using local v1. V1/v2 runs accept local v1 only.
The `roots`, `worktrees` and artifact mappings contain all local absolute paths. Tracked entry metadata uses role references and local IDs.

`selectedCandidateId` selects an existing v3 candidate. It stores no status or
frontier. Candidate input fingerprints include the artifact identity. The compact
report retains that candidate's original revisions and reports integration
revisions separately. An older frozen selection remains known; a changed
integration revision requires the existing applicability assessment, rather than
relabeling an old observation. Without a selection, exactly one candidate matching
all integration tips can be identified; otherwise identity is unknown. Historical
v1/v2 records retain unknown candidate identity.

## Reading the report

Read `candidate`, `integration`, `claims`, `outputs`, `scenarios`, `capacity`,
`authorizations` and `nextActions` in that order, then open only the selected
canonical ticket. Outputs group the existing per-ticket integration states,
scenario IDs and blockers. Claims retain their coordinator and source records;
blocked and handoff claims keep ownership without consuming active capacity.
Scenario `remaining` derives from its canonical owner being unresolved or lacking
accepted integration; it does not introduce another qualification status. Scenario
evidence lists original outcomes, freshness and reviewed carry-forward reasons.
`applicabilityTarget` names the integration revisions being evaluated, separately
from the selected frozen source. `applicability: available` means at least one bound passing observation
is fresh or carried forward at the integration candidate; it does not establish
complete scenario qualification. Qualification remains explicitly `not-assessed`;
the canonical ticket and its required evidence own closure.

Authorization records reuse v2 operational metadata: dated action, resources,
limits, source, recorded/revoked/superseded state and status reference. Empty or
absent records remain unknown. Every record retains `permission: not-assessed`.
Requirements connect records to tickets. Reconcile actual user scope before
execution; schema validation and a dispatch suggestion grant no permission.

`nextActions` derives reconciliation actions from diagnostics, dispatch candidates
from the existing frontier, and review actions from handoff claims. Scoped stale
v3 evidence retains unrelated eligible work. Integrity failures withhold dispatch.
The report is observed state, not a persisted frontier. Exit 0 establishes metadata
consistency; it establishes neither ticket completion nor native acceptance.

## Verified migration for adoption (ticket 10)

1. Start at the active effort's existing canonical integration checkout and README.
   Inspect Git and canonical numbered tickets. Archive superseded tracked narrative
   under the canonical `history/` directory with a dated reference. Preserve failed
   receipts, historical ledgers and required artifacts outside disposable worktrees;
   retain source branches. Completion: every retained artifact has a durable local
   mapping, and original failed outcomes remain available.
2. Prepare a v3 ledger from the current approved v2 ownership/operational record.
   Reconcile repository tips, canonical tickets, retained claims, integration
   receipts and exact evidence observations. Use the approved finite scenario
   allocation and [v3 applicability contract](applicability-v3.md). Set
   `selectedCandidateId` to the actual frozen candidate; retain its source revisions
   and input fingerprints. A location/preservation manifest alone is not a ledger.
   Completion: the public CLI validates the prepared ledger and reports real
   unavailable or scoped stale evidence explicitly.
3. Prepare local configuration with explicit integration roots and an `active-run`
   artifact mapping to that ledger. Copy the entry template to the canonical
   directory, matching its run, branches and selected candidate. Run the entry
   command above with both human and JSON output. Completion: entry and direct
   ledger invocation produce the same candidate, owners, blockers, authorization
   requirements and eligible actions; wrong run/candidate/branch/reference fails.
4. Replace the canonical README's execution navigation with one current-entry link
   and the command. Replace superseded narrative with a short archive pointer,
   keeping dated records labeled historical. Keep the current run prose limited to
   exceptions and source references; derive status from tickets and the report.
   Completion: a fresh coordinator obtains candidate, owners, blockers,
   authorization scope and next action from entry + compact report + selected ticket.
5. Save the exact candidate, command, Node version, outcome and report outside
   disposable worktrees. Use the fixture suite below as migration evidence; then
   verify the actual active effort separately before adopting it. Completion: the
   coordinator reviews actual metadata and performs the authorized migration.

```sh
npm test -- --runInBand tests/agents/agentStatus.test.ts
```

The populated real-Git walkthrough exercises the pointer, current and older frozen
candidate, scoped stale evidence, missing run/entry references and integration
root mismatches. Existing fixtures retain v1/v2 compatibility, claim conflicts,
Git/index/file preservation and private canary protection. This migration changes
no active UX claims or historical acceptance outcomes by itself.
