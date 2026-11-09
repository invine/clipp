# Clipp Relay visual corrections

**Owner:** relay (Clipp Relay). **Tracker:** client (Clipp). **Canonical feature directory:** client:`.scratch/relay-clipp-style-ui-corrections/`. Relay owns portal implementation and verification; the client repository owns the local issue tracker and evidence. No Clipp client implementation is proposed.

The [review](review.md), [specification](spec.md) and [decision record](decisions.md) concern the implementation in [Implement Clipp relay spec](codex://threads/01a19d68-902d-73e3-a69e-23b1b83bd9e6), Relay branch `codex/relay-clipp-style-integration` at `020f47da263d0765bae42b7505c760d8caac1a35`, in `relay:.local/relay-clipp-style/worktrees/integration`, clean when reviewed. Verify current state and create this corrective effort's own integration lineage before implementation; do not assume that historical checkout is an appropriate mutable baseline.

The [Clipp Relay mockup](../../mockups/clipp-relay/index.html) is the visual reference. [Evidence](evidence/) contains synthetic renders made with the exact implementation's embedded Go portal templates, assets and histogram helper, plus mockup captures; the renders are not the built service or an HTTP/authentication test. All identities, endpoints, quotas and statuses are fixtures.
