# Ownership contract (run v2)

Use [run schema v2](run-v2.schema.json) for new runs, with the existing [local schema v1](local-v1.schema.json). Keep v1 run records readable and unchanged: absent ownership is unknown, not inferred from Git or a directory name. The CLI emits the input run version; all existing claim, integration, evidence and frontier checks still apply.

V2 adds required `ownership` to the v1 run fields. References are `{role, path}`: `client` or `relay` plus a path relative to that explicitly selected root. Local artifact IDs resolve only through `local.artifacts`; their paths and contents are excluded from ownership output. Both repository roots remain required by status even when only one role participates in the effort.

| Field                        | Contract                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonical`                  | Reference to the owning repository's `.scratch/<feature>` directory.                                                                                                                                                                                           |
| `specification`, `decisions` | References to `spec.md` and `decisions.md` in that directory. `tracker` must identify its `issues` directory in the same role.                                                                                                                                 |
| `roles`                      | Nonempty object mapping participating roles to responsibilities; includes the owner and every ticket role.                                                                                                                                                     |
| `pointers`                   | One README reference per participating non-owner role. Companion directories contain pointers, without another `spec.md` or numbered tickets directly or under `issues/`.                                                                                      |
| `coverage`                   | Nonempty array of `{decision, source, disposition, requirements}`. Decision IDs are unique; `source` is an available public file reference. Disposition is `accepted`, `superseded`, `rejected` or `deferred`.                                                 |
| `requirements`               | Exact, unique ATX heading text in the canonical specification, excluding code fences. Accepted decisions require at least one heading; other dispositions may use an empty array. Coverage validates destinations, not semantic completeness or authorization. |
| `artifacts`                  | Required preserved artifact IDs, including handoff or diagnostic evidence outside current acceptance records. An empty array explicitly records no required artifacts.                                                                                         |

The owner README and each companion README contain exactly one of each metadata field:

```markdown
**Owning repository:** client (Clipp)
**Canonical feature directory:** client:`.scratch/operational-reliability/`
```

Trailing slash, trailing punctuation and descriptive owner text are accepted. The CLI checks these bounded public README files and specification headings; it checks other reference availability using file metadata only. Public document reads reject symlinks and `.local` paths. Private decision prose, artifact content, credentials and recorded commands are never read or executed.

A compact example of the added record (the rest of the run remains as in the [v1 example](run.example.json)):

```json
{
  "canonical": { "role": "client", "path": ".scratch/operational-reliability" },
  "specification": {
    "role": "client",
    "path": ".scratch/operational-reliability/spec.md"
  },
  "decisions": {
    "role": "client",
    "path": ".scratch/operational-reliability/decisions.md"
  },
  "roles": {
    "client": "Coordination and native runners",
    "relay": "PostgreSQL verification"
  },
  "pointers": [
    { "role": "relay", "path": ".scratch/operational-reliability/README.md" }
  ],
  "coverage": [
    {
      "decision": "D5",
      "source": {
        "role": "client",
        "path": ".scratch/operational-reliability/decisions.md"
      },
      "disposition": "accepted",
      "requirements": ["Artifact ownership"]
    }
  ],
  "artifacts": ["handoff-05"]
}
```

Record every accepted decision and any superseded proposal needed to avoid ambiguity. Human Spec review compares this inventory with the actual decisions and verifies each requirement's substance; an omitted decision cannot be discovered from arbitrary prose. This excerpt covers only D5, not the entire operational-reliability effort.

Status withholds the frontier for ownership/pointer disagreement, unavailable references, duplicate decision IDs, absent or ambiguous requirement headings, duplicate companion tickets, or unavailable required artifacts. V2 also rejects ledger, local configuration and required artifacts inside linked Git worktrees, including integration worktrees; preserve them under the primary checkout's ignored `.local/<effort>/` or another durable directory. Resolved real paths prevent a symlink from disguising an artifact inside a disposable worktree. Availability uses file metadata, not an artifact-content read.

## Extending operational records

Ticket 06 extends this v2 schema/report with operational facts, reusing role/path references and artifact IDs. Ownership is required in v2; operational facts absent from older records remain unknown. Extend the checked-in schema and CLI validation together, retaining v1 dispatch and current integrity gates. Schema references resolve only from these checked-in schemas; run data cannot supply a schema. Preserve read-only behavior and report explicit unavailable/stale states without deriving permission or running a saved access command.
