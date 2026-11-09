# Clipp Relay — Clipp-aligned portal style

**Owning repository:** relay (Clipp Relay). **Tracker repository:** client (Clipp).
**Canonical specification directory:** client:`.scratch/relay-clipp-style/`.
**Repository responsibilities:** relay owns portal templates, assets, existing handlers and verification; client holds the local tracker and mockup reference only. No Clipp client implementation is proposed.

The [specification](spec.md) and [decision record](decisions.md) define this effort. The [new interactive design reference](../../mockups/clipp-relay/index.html) is untracked at the time of writing and must be preserved or frozen into the implementation's durable evidence before a disposable checkout or cleanup. It uses example identities and data and is not production code.

The [previous Relay portal workspace specification](../relay-portal-workspace/spec.md) and its linked evidence define existing functionality and contracts. This spec changes presentation and introduces a light/dark appearance choice; preserve the existing functional, security and no-script requirements. Before implementation, inspect the current relay `main`, ownership and worktrees and establish this spec's own integration lineage according to project operations. The historical Relay portal integration checkout is prunable; its recorded path is not evidence of an available checkout or current baseline.
