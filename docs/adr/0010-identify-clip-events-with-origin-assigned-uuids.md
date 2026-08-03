---
status: accepted
---

# Identify Clip events with origin-assigned UUIDs

A Clip represents one clipboard capture event rather than a unique content value. The originating Device Identity assigns a UUIDv4 exactly once, and every live forwarding hop, persisted history record, and history reconciliation preserves that UUID unchanged. Protobuf carries the UUID as exactly 16 raw bytes while local and diagnostic surfaces may render its canonical lowercase text form.

Clipp deduplicates only by this immutable event identity. It never merges different UUIDs based on content hashes, similar timestamps, or inferred user intent. Automatic polling repeats, transport retries, history re-export, and Remote Clip write echoes preserve or suppress the original event; an explicit later copy or history reuse creates a new event and UUID even when the content is identical.

History storage atomically inserts by UUID. The first valid durable record wins if another message presents different immutable fields under the same UUID; exact matches are idempotent duplicates.

## Consequences

Clipp avoids false merges of legitimate repeated copies and gains a stable network-wide key for live gossip, history reconciliation, deletion suppression, and future inventory optimization. Different devices that independently capture identical content produce distinct Clips. Correctness therefore depends on capture-boundary echo suppression and durable atomic insert-if-absent behavior rather than content-based deduplication.
