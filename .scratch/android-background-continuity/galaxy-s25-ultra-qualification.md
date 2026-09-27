# Galaxy S25 Ultra Android Background Continuity Qualification

Status: not run — no support claim

This is a candidate physical record, not a selected release gate. Complete it only if ticket 03 selects Galaxy S25 Ultra for the final hardware matrix. Follow [`docs/android-background-continuity-release.md`](../../docs/android-background-continuity-release.md), record the device's actual configuration without using it as a preliminary eligibility check, and do not record Clip content or any device identity.

## Build and configuration

- Tester:
- Clipp commit/build:
- Device model:
- Android version/build:
- Test start/end timestamps and timezone:
- Battery mode:
- Background-use setting:
- Battery optimization state:
- Notification permission at start:
- Network/relay configuration, without addresses or identities:
- Exported diagnostic filename and schema version:

## Eight-hour timeline

| Timestamp | Lifecycle/test action | Content-free observed status | Reconnect duration | Pending action count | Pending application present | Result/limitation |
| --- | --- | --- | ---: | ---: | --- | --- |
| | Foreground launch and opt-in | | | | | |
| | Home / application switch | | | | | |
| | Screen off | | | | | |
| | Doze | | | | | |
| | Network loss / restoration | | | | | |
| | Relay loss / restoration | | | | | |
| | Process pressure | | | | | |
| | Selected-text ingress | | | | | |
| | Sharesheet ingress | | | | | |
| | Notification permission denied / restored | | | | | |
| | Back / explicit close | | | | | |
| | Recents removal | | | | | |
| | Task Manager stop / reopen | | | | | |
| | Force-stop / reopen | | | | | |
| | Reboot / explicit reconnect | | | | | |

## Invariants

- [ ] Every successfully accepted explicit share remained one durable Local Clip.
- [ ] Clipboard History Reconciliation never changed the system clipboard.
- [ ] Pending live recovery applied at most the newest eligible Clip and replayed no stale value.
- [ ] Connected was shown only with a usable Trusted Device connection.
- [ ] No clipboard read occurred while the Activity was unfocused.
- [ ] Stop/task-removal/Task Manager/force-stop/reboot boundaries remained stopped as documented.
- [ ] Notifications, application logs, and exported diagnostics contained no prohibited content or identity fields.
- [ ] The run lasted at least eight continuous hours.

## Decision

- Classification: not run / pass / limited / unsupported
- Limitations:
- Evidence reviewer:
- Review timestamp:

Do not select pass unless every invariant is checked. Repeated Activity-owned WebView destruction despite the foreground service requires limited or unsupported classification; it is not grounds to weaken an invariant.
