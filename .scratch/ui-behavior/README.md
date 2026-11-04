# UI behavior and runtime adapters

Owning repository: client (Clipp).
Canonical feature directory: client:.scratch/ui-behavior/ on codex/ui-behavior-integration.
Triage: ready-for-agent.
Execution: implementation authorized by the user on 2026-11-04 via the request to implement tickets in this directory.

The [specification](spec.md) remains unchanged. The user approved the following 16-ticket breakdown for publication. Each ticket contains acceptance criteria and explicit blocking edges.

| Ticket | Deliverable                                                                                              | Blocked by                                         |
| ------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 01     | [Establish the seam through Pairing submission](issues/01-pairing-submission-seam.md)                    | None                                               |
| 02     | [Adapt Android to the shared UI seam](issues/02-android-runtime-adapter.md)                              | 01                                                 |
| 03     | [Adapt extension popup and management page](issues/03-extension-runtime-adapter.md)                      | 01                                                 |
| 04     | [Handle Trust Request decisions](issues/04-trust-request-decisions.md)                                   | 01                                                 |
| 05     | [Handle Pairing codes and scanning](issues/05-pairing-code-and-scan.md)                                  | 01, 02                                             |
| 06     | [Handle Share Now and Clip reuse](issues/06-share-now-and-reuse.md)                                      | 01                                                 |
| 07     | [Handle Clipboard History mutations](issues/07-history-mutations.md)                                     | 06                                                 |
| 08     | [Consolidate navigation and task ownership](issues/08-navigation-and-task-ownership.md)                  | 01                                                 |
| 09     | [Handle device naming and revocation](issues/09-device-naming-and-revocation.md)                         | 08                                                 |
| 10     | [Handle relay management journeys](issues/10-relay-management.md)                                        | 08                                                 |
| 11     | [Handle preferences and recovery](issues/11-preferences-and-recovery.md)                                 | 01                                                 |
| 12     | [Handle notification-driven journeys](issues/12-notification-journeys.md)                                | 02, 03, 08                                         |
| 13     | [Handle Android Background Continuity controls](issues/13-android-background-continuity.md)              | 02                                                 |
| 14     | [Handle identity-reset presentation and Identity Rotation](issues/14-identity-reset-and-rotation.md)     | 02, 03, 08                                         |
| 15     | [Remove migration compatibility and complete ownership](issues/15-remove-migration-compatibility.md)     | 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14 |
| 16     | [Complete scenario coverage and verify the application](issues/16-scenario-coverage-and-verification.md) | 15                                                 |

Ticket 01 is the only dependency-ready starting point. The frontier is derived from each ticket's Status and Blocked by fields as work completes; the execution stop still applies.

The initial three-ticket breakdown is [archived with its comments and released claims](history/initial-breakdown/README.md). Those historical records are not current tasks. No existing partial implementation is marked accepted or complete.

[Decisions](decisions.md) retain the approved scope, test seam and execution limit. Mutable run records and preserved partial work remain outside the tracker. A ready-for-agent label describes readiness; implementation requires a new user instruction.
