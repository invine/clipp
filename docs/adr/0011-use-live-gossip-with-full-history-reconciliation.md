---
status: accepted
---

# Use live gossip with full history reconciliation

Clipp separates low-latency clipboard delivery from durable repair. `/clipp/clip/1.0.0` carries one Clip per short-lived stream and forwards a newly learned live Clip once among connected Active Members. `/clipp/history/1.0.0` exchanges one-way, size-bounded snapshots of the sender's complete unexpired Clipboard History without applying imported records to the current system clipboard.

Each Active Member independently offers a full snapshot on connection, reconnection, and transition to Active membership. Enabling Auto Sync also sends snapshots and History Requests to connected Active Members. A history stream that imports new eligible Clips triggers full snapshots toward other connected Active Members, while stable Clip IDs and atomic insert-if-absent storage make repeated delivery idempotent.

The initial history protocol has no inventory, digest, cursor, delta, acknowledgment, or same-connection retry. Live and history protocols negotiate and fail independently, and history remains the repair path for live sends missed while a peer was offline or unreachable.

## Consequences

The initial protocol favors a small, auditable correctness model over transfer efficiency. Every retained Remote Clip can be re-exported without changing its Clip ID or origin attribution, allowing history to survive an offline origin through other Active Members.

Full snapshots and propagation after historical import can create redundant traffic and message waves. Clip Sharing Lifetime, per-frame bounds, local capacity, deterministic ordering, per-peer stream coalescing, and durable duplicate suppression keep the initial model bounded enough for small owned-device networks. Inventory exchange, deltas, debouncing, topology selection, acknowledgments, and other optimization remain deferred and may require a later protocol version.
