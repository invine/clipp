---
status: accepted
---

# Use hop-authenticated unsigned Clips

Clipp does not add an application-level origin signature to a Clip. A receiver accepts live or historical Clips only when the immediate sender is authenticated by the libp2p connection and is an Active Member. When an Active Member forwards or re-exports a Clip, it vouches for the complete Clip under its own current authority.

Every Clip retains immutable `originPeerId` attribution across forwarding and history reconciliation, but this value is forwarded metadata rather than portable cryptographic proof of original authorship. On the first live transmission from the origin, `originPeerId` must equal the authenticated immediate sender; later hops may differ.

## Consequences

The protocol avoids storing and verifying an end-to-end signature on every Clip. A compromised Active Member can forge another device's origin attribution, but an origin signature would not stop that member from injecting equally harmful clipboard content under its own identity. Security-sensitive receive paths must therefore authenticate the immediate libp2p peer, require current Active membership, and never authorize a message from a sender identity claimed only inside the payload.
