# Operational reliability

**Owning repository:** client (Clipp)  
**Canonical feature directory:** client:`.scratch/operational-reliability/`  
**Specification:** [spec.md](spec.md)  
**Decisions and coverage:** [decisions.md](decisions.md)

| Repository role | Responsibility                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| client          | Canonical specification, decisions, tickets and coordination; native acceptance runners; shared tracker and recovery tooling. |
| relay           | PostgreSQL fixture execution and PR CI; companion operational documentation and pointer to this canonical directory.          |

Resolve repository-relative references against explicitly selected roots. The relay directory with this feature name is a pointer, not another tracker. Existing [project operations](../../docs/agents/operations.md), [coordination](../../docs/agents/workflow.md), [recovery](../../docs/agents/recovery.md), and [tracker conventions](../../docs/agents/issue-tracker.md) apply. At most two implementation agents may be active in this run.

Design approved in the current chat on 2026-10-25, with the clipboard amendment recorded in [decisions](decisions.md). Testing boundaries and the six-ticket breakdown were approved in the current chat on 2026-10-25 ("I agree"). The numbered issue files are authoritative; implementation follows the run record.

## Preservation and evidence

Durable private run records and artifacts belong under ignored client:`.local/operational-reliability/run-20261025/`, outside disposable worktrees. Store local repository roots and artifact locations there; tracked references use repository roles and relative paths. Preserve evidence before retiring any worktree created by this effort. Do not put credentials, private clipboard content or private profile data in Git.

Historical auth/logging materials remain in their established relay directories. The relay auth artifact index already records recovered decisions and provenance; this effort does not move or reclassify them. The completed client agent-workflow effort and active UX/auth work retain their own records.

Initial inspected primary revisions: client `a2e1a64cad05eadb7c567b48e3ec45ce7cd51e33`; relay `2b8ad5da548511a6e3dffffcd99765f057c1b1fe`. These are planning observations, not tested implementation revisions. Reinspect Git before creating integration branches or dispatching. Retain unrelated dirty files, untracked efforts, existing worktrees and stashes.

## Existing facilities

| Area       | Sources to reuse                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL | relay:`scripts/smoke-postgres.sh`, `.github/workflows/verify.yml`, `scripts/test-verify.py`, `internal/database`, `internal/auth`, `internal/quota`, `docs/verification.md`.                                                                     |
| Electron   | [Existing acceptance runner](../../scripts/electron-relay-acceptance.mjs) and [acceptance guide](../../docs/electron-relay-acceptance.md).                                                                                                       |
| Chrome     | [Existing clipboard runner](../../apps/extension/scripts/verify-clipboard-io.mjs), [relay fixture](../../apps/extension/scripts/relay-acceptance-fixture.mjs), and [acceptance guide](../../apps/extension/README-managed-relays.md).            |
| Android    | [Existing device precheck](../../apps/android/scripts/verify-api-31-emulator.mjs), [instrumentation setup](../../apps/android/scripts/native-acceptance.init.gradle), and [native guide](../../docs/android-managed-relay-native-acceptance.md). |
| Recovery   | [Status CLI](../../scripts/agent-status.mjs), [public Git-fixture tests](../../tests/agents/agentStatus.test.ts), and [navigation checks](../../tests/agents/sourceLookup.test.ts).                                                              |

The separately inspected UX integration at `a8a4f390b0f202c7424fae9ed18e97fc72729343` contains focused Android diagnosis patterns and owned-target checks. Reuse applicable dependency-independent concepts; do not merge its unfinished product work into this effort. Its retained run metadata is dated evidence and must be reconciled with current Git before reuse.
