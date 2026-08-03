# 11 — Repair missed Clips with full history snapshots

**What to build:** Repair Clips missed while devices were offline by exchanging complete bounded eligible Clipboard History snapshots without changing the receiving clipboard.

**Blocked by:** 05 — Converge Device Networks; 08 — Enforce local history policy; 10 — Gossip live Clips across the Device Network.

**Status:** ready-for-agent

- [ ] Clipboard History Reconciliation uses `/clipp/history/1.0.0` independently of the live protocol and without legacy fallback.
- [ ] Each established or re-established Active-Member connection causes each side to open one one-way snapshot stream containing size-bounded non-empty History Batch frames and then EOF.
- [ ] Eligible retained Clips are ordered by descending `capturedAt`, then ascending raw UUID bytes, and snapshot start captures a stable in-memory Clip ID list without holding a storage transaction during network I/O.
- [ ] Each listed Clip is reloaded and rechecked for existence, suppression, expiration, frame eligibility, and current exchange eligibility immediately before encoding.
- [ ] Isolated outbound read failures skip and log only the affected Clip ID and do not stop the remaining snapshot.
- [ ] The receiver permits one inbound snapshot per authenticated sender, validates each Clip independently, and imports accepted records with `liveHandled` false.
- [ ] Historical import never updates the current clipboard, creates a live notification, or enters the live forwarding path.
- [ ] Exact duplicates, conflicts, malformed Clips, expired Clips, and locally suppressed Clips do not prevent other valid records in the batch from importing.
- [ ] Framing failure or local storage failure terminates the stream without rolling back records committed earlier.
- [ ] An inbound stream that imported new eligible data triggers ordinary full snapshots to other connected Active Members except the immediate sender.
- [ ] Interrupted reconciliation waits for a later ordinary trigger and restarts from a full eligible snapshot; no same-connection automatic retry, inventory, delta, cursor, or acknowledgment is added.
- [ ] Cross-runtime tests prove offline repair, history-only import, re-export by non-origin members, and idempotent repeated snapshots.
