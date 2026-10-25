# Approved decisions and specification coverage

Source: user instructions and design confirmation in Codex chat `01a173ed-a0b9-7ac2-9d50-97985faaaf1d`, 2026-10-25 (Asia/Dubai). The confirmation was: “yes to all except q4. q4 - you have a permission to overwrite clipboard content”. The preceding six-question design round is the source for D1–D6. This record preserves the instruction and scope; it creates no new authorization.

| ID  | Accepted decision                                                                                                                                                                                                                                                                                            | Specification coverage                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| D1  | One sequential PostgreSQL PR job; full database/auth/quota on supported 17 and 18, existing focused PG18 races and unsupported-version checks; fail on unavailable fixtures, required skips/omissions and cleanup failure; retain fast verification.                                                         | Implementation decisions: Database CI; stories 1–7.           |
| D2  | Focused improvements to maintained Electron, Chrome and Android entry points; exact owned candidate and basic interaction before matrix; separate prerequisite/runner/product/unknown outcomes; no wholesale UX import.                                                                                      | Implementation decisions: Native readiness; stories 8–12.     |
| D3  | Initial attempt plus at most two diagnostic attempts per failed scenario, within 20 minutes of troubleshooting; each retry needs a changed hypothesis/environment; preserve failure and continue eligible work. Initial builds and normal matrix execution are outside the budget.                           | Implementation decisions: Bounded diagnosis; stories 13–15.   |
| D4  | User permits overwriting clipboard content for this effort's native acceptance tests. Preservation/restoration is not a prerequisite. Record clipboard scope and truthful cleanup; report restoration only when actually attempted and verified.                                                             | Implementation decisions: Clipboard; stories 16–18.           |
| D5  | Client owns this canonical feature directory; relay owns its implementation role and a pointer. Preserve private evidence outside disposable worktrees. Leave historical auth/logging ownership intact.                                                                                                      | Implementation decisions: Artifact ownership; stories 19–23.  |
| D6  | Versioned extension of existing durable records; historical records remain readable. Separate exact target identity, display name and qualification; preserve observed access routes/rechecks and scoped authorizations. Unknown facts stay unknown; references do not grant permission or execute commands. | Implementation decisions: Operational handoff; stories 24–29. |

## Authorization evidence for this run

| Field                   | Recorded fact                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source/date             | Direct user message quoted above, current chat, 2026-10-25.                                                                                                 |
| Action                  | Overwrite clipboard content during native acceptance testing for this effort.                                                                               |
| Resource scope          | Clipboard used by this effort's owned native acceptance runs.                                                                                               |
| Limits                  | Applies to testing this effort, not unrelated use, publication of clipboard data, personal-profile changes or system settings. Restoration is not required. |
| Revocation/supersession | No revocation observed as of this confirmation. D4 supersedes the proposed Q4 preservation prerequisite. Check later user instructions on resume.           |

The initial task authorizes preparation now and local implementation after ticket approval. Publication, deployment and personal-profile/system changes require applicable authorization. Earlier applicable user authorization may be reused when its actual scope is established; these statements do not invent a blanket prohibition or permission for historical actions.

## Checkpoints

- Design: approved with D4 amendment.
- Testing boundaries: approved by the user on 2026-10-25 ("I agree").
- Ticket breakdown: six tickets and the sole 05 → 06 blocking edge approved on 2026-10-25 ("I agree").
- Implementation: the reopened Chrome and Android code findings are fixed, and the Electron diagnostic-clock finding is fixed. Ticket 02 is resolved after refreshed checks and review. Tickets 03 and 04 remain open because their bounded native qualification did not complete: Chrome clipboard acceptance timed out after the popup interaction preflight, and Android's three readiness attempts ended with an ADB timeout before instrumentation. Those retry budgets are exhausted. An API 31 emulator was available; only the isolated acceptance packages were installed there, and the connected phone was not targeted. Hosted PostgreSQL CI was not run. No unperformed qualification is claimed.
- Refreshed final Standards/Spec review passed; canonical ledger reconciliation remains pending.

These operational choices preserve existing product and transport invariants. They do not introduce new product glossary concepts or require an architectural decision record. The compact coverage table is the decision record for this effort.

## Docker Desktop authorization update

On 2026-10-25 in the current chat, the user answered **"Yes, launch Docker Desktop"** to the explicit request to launch the installed application for this effort's disposable PostgreSQL 17/18 tests. Scope: start the local Docker daemon and run this effort's owned disposable database fixtures. Limits: no settings changes or software installation. Source: direct async user reply in chat `01a173ed-a0b9-7ac2-9d50-97985faaaf1d`. No revocation observed. This supersedes the coordinator's earlier conservative delegation restriction on starting Docker; the prior automatic-review rejection remains recorded as historical evidence.
