# 01: Require real PostgreSQL coverage in PR CI

**What to build:** Make every relay PR execute and prove the required real PostgreSQL coverage using the existing smoke runner, while keeping ordinary verification fast.

**Blocked by:** None (can start immediately).

**Status:** claimed

- [ ] One sequential database job exercises database/auth/quota on PostgreSQL 17 and 18, existing focused PG18 races and rejection checks.
- [ ] Missing fixtures, required skips, omitted suites and incompatible opt-outs fail; public command negative fixtures prove these cases.
- [ ] Fixtures use isolated TLS/SCRAM roles and safe suite ordering; cleanup covers exact owned resources and anonymous volumes, reporting failure.
- [ ] Evidence records revision, tools/images, executed suites and cleanup without secrets; real local execution and hosted execution are distinguished.

## Context

The [approved specification](../spec.md) and [decision coverage](../decisions.md) define the complete contract and confirmed public testing seams. Preserve existing product invariants; this ticket changes operational verification only. The coordinator owns claims, integration and resolution.
