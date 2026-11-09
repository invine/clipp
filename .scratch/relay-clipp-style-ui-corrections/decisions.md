# Decision coverage

| ID | Source | Disposition | Specification requirements |
| --- | --- | --- | --- |
| D1 | User request, 2026-11-02 | Accepted | Review the linked Relay implementation against its previous mockup and specify the visual and usability fixes. |
| D2 | User-selected Relay mockup and Clipp workspace style | Preserved | Dark-first and light themes, compact navigation, accurate quota/history presentation, recognizable brand and contextual tasks are the visual direction; prototype data/actions are illustrative. |
| D3 | Relay glossary and prior accepted portal contracts | Preserved | Retain real account, usage, session, grant, administrator, consent, security, no-script and recovery behavior; no transport or account policy changes. |
| D4 | User's confirmation of Relay portal test seams, 2026-10-26 | Reused | Use the production portal HTTP boundary and browser on the built served application with isolated fixtures; this is the same portal and seam. |
| D5 | User test direction, 2026-11-02 | Preserved | Do not run connection tests or tests that send Clips; use synthetic fixtures and avoid real credentials and accounts. |
| D6 | Linked implementation thread user report | Open observation | The user reported unreadable text in light theme. No specific affected page was identified. The signed-out page and synthetic active-account view appeared readable in sampled light renders, so investigate rather than asserting the report is resolved. |
| D7 | Visual review of template fixtures, 2026-11-02 | Evidence | Near-invisible dark controls, clipped narrow navigation, inefficient overview and admin layouts, mobile history legibility and brand/style mismatch are observed; no claim is made that synthetic screenshots establish handler or native behavior. |
