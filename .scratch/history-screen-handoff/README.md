# History screen handoff

**Owning repository:** client (Clipp)
**Canonical feature directory:** client:`.scratch/history-screen-handoff/`

The Clipp repository owns the shared UI, runtime integration and acceptance for this effort; no relay-repository implementation is anticipated. The [specification](spec.md), [decision record](decisions.md), [implementation issue](issues/01-implement-history-design.md) and preserved [interactive reference](reference/index.html) are the canonical handoff. The reference is a snapshot of the last published preview, not the running app.

No integration branch or implementation run has been created by this handoff. Before dispatch, the coordinator must establish the feature's own integration checkout from the then-current `main`, record the baseline and check for overlapping work as required by project operations. The current primary checkout contains unrelated modifications; preserve them. Existing UX specifications remain in force except where the explicit decisions in this handoff supersede them.
