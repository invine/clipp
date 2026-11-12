# Deterministic Clipp delivery

**Owning repository:** client (Clipp)
**Canonical feature directory:** client:`.scratch/deterministic-delivery/`

Clipp owns the local delivery command, release profiles, artifact records and adapters for Electron, Chrome and Android. All orchestration, builds and checks run on the Mac. No companion repository participates.

The [specification](spec.md) defines the six targets and their completion criteria. The [decision record](decisions.md) preserves the user's scope decisions and distinguishes them from specification defaults.

The user approved publication of these 11 tickets on 2026-11-10 and authorized implementation separately. The implementation merged into `main` at `f1e3759` (PR #55). The [final qualification ticket](issues/11-qualify-workflow.md) records the local Mac evidence and the outstanding live Play internal publication check.

## Implementation tickets

Each ticket records its resolution, acceptance criteria and original dependencies.

| Ticket                                                                                         | Blocked by     |
| ---------------------------------------------------------------------------------------------- | -------------- |
| [01: Plan delivery from an exact source revision](issues/01-plan-exact-source.md)              | None           |
| [02: Prepare and verify a resumable isolated candidate](issues/02-resumable-candidate.md)      | 01             |
| [03: Produce a verified Electron package](issues/03-electron-package.md)                       | 02             |
| [04: Build and update the local Chrome extension](issues/04-chrome-local.md)                   | 02             |
| [05: Qualify an Android candidate using native acceptance](issues/05-android-qualification.md) | 02             |
| [06: Produce verified Android APK and AAB artifacts](issues/06-android-package.md)             | 05             |
| [07: Install and confirm the Electron candidate](issues/07-electron-local.md)                  | 03             |
| [08: Install and confirm Android on a selected device](issues/08-android-local.md)             | 06             |
| [09: Publish and reconcile Android internal releases](issues/09-android-internal.md)           | 06             |
| [10: Coordinate multiple targets without redundant work](issues/10-coordinate-targets.md)      | 03, 04, 06     |
| [11: Qualify the complete Mac delivery workflow](issues/11-qualify-workflow.md)                | 07, 08, 09, 10 |

Ticket 01 established source selection. After 02, the Electron, Chrome and Android paths proceeded independently. Ticket 10 coordinated package and Chrome targets, and ticket 11 verified the integrated workflow.

## Acceptance coverage

The spec remains the source of requirement meaning. This allocation identifies primary implementation coverage; ticket 11 verifies every scenario on the integrated result.

| Scenario                                       | Primary tickets                              |
| ---------------------------------------------- | -------------------------------------------- |
| A01 Remote source freshness                    | 01                                           |
| A02 Preserve caller checkout                   | 02                                           |
| A03 Freeze source and successors               | 01, 02                                       |
| A04 Prerequisites and independent progress     | 01–09 for their stages; 10 for combined runs |
| A05 Enforce required gates                     | 02–10 for their stages                       |
| A06 Share only equivalent work                 | 06, 10                                       |
| A07 Electron inventory                         | 03                                           |
| A08 Native loading and Quit                    | 03, 07                                       |
| A09 Loaded Chrome identity                     | 04                                           |
| A10 Android evidence and install compatibility | 05, 06, 08                                   |
| A11 Uncertain Play upload                      | 09                                           |
| A12 Resume incomplete Play release             | 09                                           |
| A13 Artifact integrity                         | 02–10 for their artifacts/stages             |
| A14 Ownership and interruption                 | 02, 04, 05, 07, 08, 09, 10                   |
| A15 Replay and status                          | 02, 03, 04, 07, 08, 09, 10                   |
| A16 Cleanup and durable evidence               | 02–08, 10                                    |
| A17 Protect secrets                            | 01, 02, 04, 05, 06, 08, 09, 10               |
| A18 Local execution and Clipp-only scope       | 01, 02, 05, 10                               |
