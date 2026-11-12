# Decision coverage

Source: [deterministic flow conversation](codex://threads/01a1bcb0-73e1-7b73-a270-1f1511d66c8f), November 8–9, 2026, Asia/Dubai. This record distinguishes explicit user decisions from design details specified to make the flow implementable.

| ID  | Source                                                                                                                           | Disposition | Specification requirements                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| D01 | User requested a retrospective and deterministic test, build and deployment procedures, then chose “Design the full flow first.” | accepted    | Purpose and scope; Command interface; Run lifecycle                       |
| D02 | User: “let's keep it clipp related only. exclude relay-test.”                                                                    | accepted    | Purpose and scope; Delivery targets                                       |
| D03 | User: “for now let's run it on mac entirely.”                                                                                    | accepted    | Purpose and scope; Configuration and prerequisites; Verification contract |
| D04 | User accepted adding `android-package` and `android-local` to the four retained targets, then requested this specification.      | accepted    | Delivery targets; Platform requirements                                   |
| D05 | User: “Create a spec for this deterministic flow, Clipp only and running entirely on Mac. Don't implement yet.”                  | accepted    | Handoff and implementation boundary                                       |
| D06 | Earlier proposal included Relay publication/deployment and distributed Mac/CI execution. D02 and D03 narrow the first version.   | superseded  | Purpose and scope                                                         |

The command syntax, record model, recovery rules, committed-source-only first version and explicit signing modes below are specification defaults derived from the discussed design. They are not additional user quotations or authorization to operate a device, publish a release or change credentials. The earlier working-copy preview idea is deferred so the first version has one source-selection rule.

## Ticket publication decision

**D07 — accepted, 2026-11-10 (Asia/Dubai).** In the same conversation, the user approved the proposed 11-ticket breakdown and its blocking edges: “Approved. Publish all 11 tickets with these dependencies. Don't implement yet.” Coverage: Handoff and implementation boundary; the README's implementation-ticket index.

This authorizes local ticket publication only and supersedes the earlier handoff restriction on creating tickets. It preserves the specification's product scope and implementation deferral. The approved dependencies are: 01 none; 02 → 01; 03 → 02; 04 → 02; 05 → 02; 06 → 05; 07 → 03; 08 → 06; 09 → 06; 10 → 03, 04, 06; 11 → 07, 08, 09, 10. An arrow here means “is blocked by.”
