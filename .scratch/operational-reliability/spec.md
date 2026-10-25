# Operational reliability

**Status:** ready-for-agent  
**Owner:** client  
**Design:** approved 2026-10-25; see [decision coverage](decisions.md).  
**Dispatch gate:** testing boundaries and ticket breakdown approved by the user on 2026-10-25 ("I agree"); coordinator claims control dispatch.

## Problem Statement

Routine relay checks can pass while real PostgreSQL tests skip. Native acceptance can spend repeated attempts on an incorrect profile, inaccessible window, unready WebView or broken instrumentation, without distinguishing runner failure from product behavior. Clipboard cleanup can silently fail. Cross-repository plans and operational knowledge can become detached from their owner, source decisions and authorization evidence during handoffs.

The operator needs reproducible database coverage, bounded and trustworthy native acceptance, one canonical home for each effort, and durable non-secret operational facts. These improvements must preserve active work and reuse the project's existing facilities.

## Solution

Add a strict real-database PR job using the existing smoke facilities. Strengthen the existing native runners with exact target identification, a small interaction preflight, explicit clipboard scope and bounded diagnostic records. Extend tracker and recovery conventions with canonical artifact ownership, decision coverage and operational handoff metadata, validated through the existing status tooling where applicable.

## User Stories

1. As a relay maintainer, I want real PostgreSQL tests on every PR, so that routine success cannot conceal missing database coverage.
2. As a maintainer, I want both supported PostgreSQL majors exercised, so that compatibility claims reflect executed tests.
3. As a maintainer, I want absent fixtures and skipped required tests to fail the database job, so that green results mean the required suites ran.
4. As a maintainer, I want existing concurrency checks exercised with a real database, so that race coverage reaches transaction behavior.
5. As a contributor, I want ordinary routine checks to remain fast and fixture-optional, so that local iteration remains practical.
6. As an operator, I want disposable database fixtures and checked cleanup, so that verification does not damage existing services or leak resources.
7. As a reviewer, I want exact revisions and local-versus-hosted evidence, so that I know what was actually qualified.
8. As a native tester, I want the exact owned process, profile and candidate identified, so that I cannot accidentally test a different installation.
9. As a Chrome tester, I want the loaded extension identity and build tied to the candidate, so that stale output cannot pass as current evidence.
10. As an Electron tester, I want a usable owned window and real interaction checked first, so that connection availability is not mistaken for UI readiness.
11. As an Android tester, I want one selected device, installed candidate, WebView and instrumentation checked, so that readiness is established before a matrix starts.
12. As a reviewer, I want prerequisite, runner, product and unknown failures distinguished, so that environmental failures do not become product conclusions.
13. As an operator, I want each retry to test a changed hypothesis or environment, so that repeated failure produces new information.
14. As an operator, I want a finite diagnostic budget, so that troubleshooting cannot consume an unbounded session.
15. As a coordinator, I want failed evidence preserved while unrelated eligible work proceeds, so that one environment does not stall the effort.
16. As the authorizing user, I want native tests to use my permission to overwrite the clipboard, so that backup or restoration is not an unnecessary prerequisite.
17. As a reviewer, I want clipboard effects and cleanup reported honestly, so that a partial text restore cannot masquerade as complete restoration.
18. As an operator, I want clipboard content kept out of durable public evidence, so that tests record scope and outcomes without publishing private data.
19. As a coordinator, I want an owning repository chosen before plans and tickets, so that all participants find one canonical feature directory.
20. As an implementer, I want explicit participating repository roles and cross-repository pointers, so that ownership is distinct from the location of code changes.
21. As a reviewer, I want decisions mapped to specification requirements, so that accepted details are not lost during synthesis.
22. As a coordinator, I want evidence preserved outside disposable worktrees, so that cleanup cannot erase the only handoff record.
23. As a maintainer, I want mechanical reference checks, so that missing pointers and evidence are detected without another general tracker.
24. As an operator, I want deployment context, namespace, release and public endpoint recorded together, so that a familiar name cannot select the wrong target.
25. As an operator, I want target display names separated from qualification status, so that calling an installation production does not imply release acceptance.
26. As a resuming agent, I want the last observed working service-access route and a recheck procedure, so that access need not be rediscovered from scratch.
27. As a resuming agent, I want authorization source, date, action, resources and limits, so that applicable permission can be reused without expanding it.
28. As a user, I want revocations and superseding instructions visible, so that obsolete permission cannot silently govern a new action.
29. As a maintainer, I want historical run records readable and unknown facts explicit, so that format evolution does not rewrite history or invent evidence.

## Implementation Decisions

### Database CI

- Add one sequential, credential-free database job to the existing relay PR workflow. Preserve existing routine/race jobs. Use the repository-supported PostgreSQL majors 17 and 18, not an inferred upstream support range.
- Reuse the existing PostgreSQL smoke entry point and fixture lifecycle. Require complete database/auth/quota suite execution on both majors, existing focused PostgreSQL 18 database-backed races, and existing unsupported-version/TLS/role rejection behavior.
- Strict execution must reject missing required configuration, required test skips, empty or omitted suites, incompatible coverage opt-outs, provisioning failures and cleanup failures. Verify actual test execution events and required coverage; command exit status alone is insufficient. Keep ordinary fixture-optional testing outside this strict job.
- Use fresh loopback fixtures, generated test-only credentials, TLS/SCRAM and separate migration/serving roles. Respect destructive migration-test ordering, refresh serving grants after schema recreation, and stop the service before suites that conflict with background maintenance. Do not parallelize shared destructive fixture state.
- Clean up exact owned processes, containers, anonymous volumes and temporary secrets. Retain safe revision, tool/image identity, suite execution and cleanup evidence; avoid uploading private configuration or generated credentials. Preserve failure status when cleanup also fails. Existing fixed listener ports are compatible with one sequential hosted job; an occupied local port must not lead to killing an unrelated service.

### Native readiness

- Modify maintained Electron, Chrome and Android acceptance entry points and their current documentation. Reuse focused existing UX patterns where they are independent of unfinished product changes. No wholesale UX branch import or new general-purpose harness.
- Bind evidence to the exact candidate revision and built artifact, with dirty state or fixture build provenance explicit. Identify the owned process/window, selected browser profile, extension ID/build or Android serial/package/instrumentation as appropriate. Build hashes must be tied to their source; hashing an arbitrary stale build is insufficient.
- Run one harmless interaction through the owned runtime before a larger matrix. Connection or DOM availability alone does not establish interaction readiness. Check target/focus ownership where the scenario depends on it; fullscreen flags alone are insufficient.
- Select Android serial consistently through preflight and instrumentation. Check boot, installed candidate, active WebView provider/version and instrumentation readiness, then demonstrate simple app interaction. Do not invoke the previously unsafe barcode-provider availability probe as a readiness check or change personal/system settings to force a pass.
- Record prerequisite, runner, product or unknown failure with the stage and evidence. Failed readiness withholds that matrix, not unrelated work. Chrome content opened in a normal tab remains tab-based evidence, not native toolbar-popup qualification.

### Bounded diagnosis

- Permit one initial attempt and at most two diagnostic attempts per failed scenario, within 20 minutes of troubleshooting. Initial builds and normal matrix execution are outside this budget; repeated rebuilds for diagnosis consume diagnostic time.
- Before a retry, preserve the prior result and record the changed hypothesis/environment plus expected distinguishing observation. An unchanged retry is ineligible even if capacity remains. Resume from preserved attempt history rather than resetting the budget through another invocation.
- Retain existing per-command timeouts. Stop at the attempt/time bound, preserve the unresolved failure and continue unrelated eligible work. This is a small procedure and record within existing runners/run evidence, not an autonomous troubleshooting framework.

### Clipboard

- The user's 2026-10-25 permission permits overwriting clipboard content for this effort's native tests. Record that authorization reference and explicit overwrite scope before host clipboard use; do not require backup or restoration or ask again for the same scope.
- Keep isolated clipboard fixtures for scenarios that already use them. Report whether the host clipboard was used/changed and whether restoration was not requested, attempted and verified, failed, or unavailable. A text-only restoration cannot claim all-format preservation. Cleanup must not silently suppress failures.
- Preserve outcome metadata rather than private clipboard contents. This authorization does not extend to unrelated data publication, personal-profile changes or system settings. Reusable runners accept scoped authorization context; the effort's permission is not a permanent global bypass.

### Artifact ownership

- Extend current tracker conventions to require one owning repository, one canonical feature directory and explicit participating roles before creating plans or tickets. Companion repositories carry pointers rather than duplicate claimable tickets.
- Use a compact decision-to-spec coverage record with decision source and disposition, including superseded proposals when needed to avoid ambiguity. Validate mechanical references through existing tooling; semantic completeness remains a review responsibility.
- Apply the convention to this client-owned effort. Preserve established relay ownership of auth/logging materials and the recovered auth provenance. No historical migration is required.
- Preserve private evidence and mutable records outside disposable worktrees and outside Git. Tracked material contains role-relative references and non-secret metadata. Keep the agent entry points small and extend their existing linked procedures.

### Operational handoff

- Extend the existing durable ledger/status tooling with versioned operational records while keeping historical records readable. Historical omissions remain unknown or unavailable, not inferred approvals or deployment facts. Do not silently rewrite historical ledgers.
- Represent deployment identity with context, namespace, release and public endpoint; keep user-facing target name and dated/revision-scoped qualification evidence separate.
- Record the last observed working service-access route, observation/source, resource scope and how to recheck availability. A prior success is not a claim of current availability. Store non-secret route descriptions and references; never credentials or authenticated URLs containing secrets.
- Record authorization source/reference, date, action, resource scope, limits and revocation/supersession. Saved records are evidence of prior authorization, not new permission. Reuse matching authorization; request additional permission only for scope exceeding it or a current tool confirmation requirement.
- Validate required shapes, identity/reference consistency and availability where mechanical checks suffice. Keep status read-only; never execute a recorded access/recheck command or derive permission from schema validity. Unavailable operational facts block only the work requiring them, consistent with existing decision/external blockers. Preserve existing integrity checks on the canonical ledger.

## Testing Decisions

Testing boundaries below were confirmed by the user on 2026-10-25. Prefer public command and runtime behavior over implementation-shaped assertions.

- **Database:** use the existing smoke command against real disposable PostgreSQL 17/18 and existing workflow-contract fixtures. Demonstrate that missing fixtures, omitted/skipped required suites and cleanup failure return failure. Exercise full real suites plus existing focused races. Fake command fixtures qualify gate behavior only, never real database acceptance.
- **Native:** test the existing runner/preflight command boundaries with controlled wrong-target, stale-build, missing-provider/instrumentation, failed-interaction and cleanup scenarios. Then run one focused owned readiness/interaction demonstration per available runtime, including authorized Chrome clipboard overwrite. Test retry refusal/history and budget exhaustion at the public command boundary. Do not run the full unrelated UX matrix to qualify this infrastructure.
- **Recovery and ownership:** extend existing temporary real-Git/public CLI fixtures and maintained-link checks. Exercise canonical owner/pointer mismatches, missing references, decision coverage, preserved private artifact availability, version compatibility, exact target identity, unknown/stale access observations and revoked/superseded authorization records. Assert read-only behavior and non-disclosure of synthetic private canaries.
- **Integration:** run relevant focused checks and required client/relay verification on exact integration revisions. Run client check before code commits. Complete independent Standards and Spec review and fix findings before resolving tickets.
- **Evidence limits:** label local command results as local. Hosted execution requires an actual hosted run and publication authorization; workflow fixtures do not substitute. Missing Android/browser/provider environments remain explicit environment-dependent checks with preserved reasons. Do not claim a native gate passed merely because its deterministic fixtures passed.

## Out of Scope

- The retrospective's other recommendations, product/auth/transport redesign, ticket completion-model redesign, broad logging changes and general architectural refactoring.
- A general-purpose native harness, wholesale UX integration, full UX matrix, real provider login/relay transfer qualification, or repair of unrelated Android barcode-provider failures.
- Historical artifact migrations, cleanup of pre-existing worktrees/stashes/profiles, credential storage, or changes to personal profiles/system settings without applicable authorization.
- Publication, hosted execution, branch-protection activation and deployment without applicable authorization. Implementing a local workflow is not evidence that GitHub has executed it.

## Further Notes

Use the existing cross-repository coordination rules: one integration branch per participating repository, coordinator-owned claims/integration/resolution, at most two implementers, preserved unrelated work, exact tested/reviewed revisions and durable evidence before worktree cleanup. The user approved the six independently verifiable tickets and sole 05 → 06 blocking edge on 2026-10-25; the numbered issue files are published in the canonical tracker. Ownership and source pointers are in the canonical feature index.
