# Reliable completion of UX implementation

**Owning repository:** client (Clipp)
**Canonical feature directory:** client:`.scratch/ux-delivery-recovery/`

The [specification](spec.md) and its testing boundaries were approved on 2026-10-28. The user subsequently approved publication of the original ten-ticket breakdown. The [scope-preserving Android refinement](android-qualification-refinement.md) retains its native qualification as ticket 11. This is the active client-owned tracker on `codex/ux-delivery-recovery-integration`. Start at the [current entry](current.json) and derived report; numbered ticket files own claims and resolution. The [continuation](run.md) records local configuration locations, evidence exceptions and preservation.

```sh
node scripts/agent-status.mjs --entry client:.scratch/ux-delivery-recovery/current.json --local /absolute/primary/.local/ux-delivery-recovery/evidence/recovery-local.json --compact
```

Supply the actual primary checkout path. Add `--json` for the same derived fields; stale or unknown evidence remains explicit.

## Approved tickets

| Ticket                                                | Deliverable                                        | Blocked by         |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------ |
| [01](issues/01-refine-acceptance-and-dependencies.md) | Finite acceptance and refined UX dependencies      | None               |
| [02](issues/02-prepare-reproducible-candidate.md)     | Reproducible frozen candidate                      | None               |
| [03](issues/03-reuse-unaffected-evidence.md)          | Safe evidence reuse and scoped invalidation        | 01, 02             |
| [04](issues/04-enforce-diagnostic-limits.md)          | Durable diagnostic limits through Electron         | None               |
| [05](issues/05-replace-electron-preparation-gate.md)  | Finite Electron preparation and native startup     | 02, 04             |
| [06](issues/06-qualify-chrome-acceptance-surface.md)  | Intended Chrome target and actual popup scenario   | 02, 04             |
| [07](issues/07-qualify-android-acceptance-target.md)  | Verified Android acceptance tooling                | 02, 04             |
| [08](issues/08-deliver-compact-resume-report.md)      | Compact authoritative recovery                     | 01, 03             |
| [09](issues/09-streamline-review-and-closure.md)      | Review, scheduling and prompt closure              | None               |
| [10](issues/10-adopt-and-demonstrate-workflow.md)     | Active UX adoption and end-to-end demonstration    | 05, 06, 07, 08, 09 |
| [11](issues/11-qualify-android-native-output.md)      | Retained actual Android readiness/behavior/cleanup | 07                 |

The numbered files own their Status and Blocked by fields. The initial frontier was 01, 02, 04 and 09; use the derived report for current eligibility and capacity. External prerequisites are checked separately before dispatch.

## Scope and integration

Reuse operational-reliability fixes and preserve its five-attempt amendment. Where consumed code is not yet on main, record the external prerequisite and continue independent eligible work; do not silently import another spec's unmerged or dirty implementation. New spec integration worktrees start from the selected main revision; ticket worktrees start from this spec's integration tip.

Tickets 01 and 08 produce verified graph and recovery migrations; ticket 10 coordinates their application to the active UX effort. Publication itself changes neither the existing UX claims nor the parent specification. Qualification stays separate from activation, and unavailable required native evidence stays explicitly unresolved. Scope-preserving host splits may be used under the approved spec if a host is unavailable; no ticket can close a required native claim using fixtures alone.

## Coverage

| Retrospective improvement                                  | Primary delivery tickets |
| ---------------------------------------------------------- | ------------------------ |
| Finite preparation instead of exhaustive local proof gates | 02, 05, 10               |
| Scoped outputs and proper qualification dependencies       | 01, 03, 10               |
| Stable candidate and applicable evidence                   | 02, 03, 05–07, 11        |
| Bounded native readiness and diagnosis                     | 04–07, 11                |
| Review, scheduling and closure                             | 09, 10                   |
| Canonical navigation and compact recovery                  | 08, 10                   |

Each ticket specifies its own acceptance and scope limits. Existing project operations, verification and preservation rules apply; source pointers and accepted product invariants are collected in the parent specification. An implementation run establishes its own current Git and durable evidence records rather than treating this publication as execution evidence.

Ticket 07 owns the verified Android tooling output; ticket 11 owns all actual Android qualification criteria, named ownership and retained semantic history. The current recovery report owns their statuses and applicable evidence. Ticket 10 may consume the qualified Chrome/Electron path after its scoped prerequisites are satisfied; that journey does not replace Android qualification or claim Android Pairing. Read [the exact criterion allocation](android-qualification-refinement.md) before changing any of those owners or dependencies.

In `current.json`, `runArtifact` is an artifact identifier, not a relative file path. Resolve it through `local.artifacts` to find the current run record. The compact report's `nextActions` lists new dispatch opportunities. An ongoing active claim's next action and the intended UX source that has not yet been frozen are retained in the report's access record `ticket10-current-ux-candidate-intent`; resolve that identifier through the same local artifact mapping. These pointers navigate current records rather than duplicating their status or qualification claims.
