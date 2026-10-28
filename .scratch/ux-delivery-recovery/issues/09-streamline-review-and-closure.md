# 09: Make review and ticket closure advance the work

**What to build:** Give coordinators and reviewers an executable working procedure that resolves completed scopes promptly, keeps independent work moving and prevents optional feedback from becoming new acceptance gates.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Parent:** [Approved specification](../spec.md).

- [ ] Update maintained repository workflow/reviewer guidance, keeping agent entry points concise and globally installed skills unchanged.
- [ ] Consolidate Standards and Spec findings for a candidate and distinguish blocking correctness, accepted-contract and documented-standard violations from optional cleanup. Optional duplication or wording advice cannot block closure without an applicable rule or concrete defect.
- [ ] Scope follow-up reviews to fixes and affected behavior, reopening settled areas only for a concrete impact. Preserve required final integration review and allow new actionable defects to be reported with evidence.
- [ ] Preserve npm check before code commits, hooks, routine verification and required native gates. Batch related fixes into reviewable changes; avoid extra full-suite reruns on unchanged inputs solely for another receipt.
- [ ] Route mechanical requirements to suitable existing executable checks and reserve reviewer prose for judgment. Do not add tests that merely match instruction wording.
- [ ] Enforce the at-most-two-implementer procedure and serialize only conflicting native resources. A blocked claim retains its owner but can release active source capacity while independent eligible work proceeds.
- [ ] Dispatch scoped context pointers and use completion/state-change waits instead of repeated unchanged polling or messages. Carry applicable user authorization through handoffs without broadening it or asking again for already-authorized scope.
- [ ] After an evidence batch, the coordinator resolves satisfied scopes, records residual scenarios, releases capacity and advances the frontier. A partial-check report does not end authorized eligible work; actual missing prerequisites or decisions are reported precisely.
- [ ] Demonstrate the procedure in a coordinator walkthrough with one complete scope, one blocked native scope and one independent eligible scope. Show optional feedback remaining nonblocking, required defects withholding closure, preserved permissions and prompt next-action selection.

**Scope boundary:** This is a workflow behavior slice that can be verified using existing tracker/status examples. It does not depend on the new compact report, weaken required checks, introduce a scheduler or close live UX tickets during its walkthrough.
