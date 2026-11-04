# Accepted decisions

- D1 — User: “I want to implement both.” Accepted architectural scope: shared reducer-backed UI behavior and runtime-to-UI adaptation across Electron, Android and extension. Coverage: specification R1–R4.
- D2 — User: “q1 yes q2 yes.” Accepted testing scope: production reducer and effect runner exercised with scripted runtime stubs, automated mounted UI tests, and an interactive browser scenario harness. Coverage: specification R5–R7 and Testing Decisions. This confirms the proposed seam; a repeated seam interview is unnecessary.
- D3 — Existing ADRs 0006, 0010, 0011 and 0012 remain accepted. The UI does not manufacture Admission, change Clip event identity, apply reconciled history to the system clipboard, or change retained Relay Session policy. Coverage: specification R8.
- D4 — User execution limit: “do not do implementation. I want you to create spec using $to-spec instead”. Accepted execution limit: stop implementation and synthesize/publish the specification only. This supersedes the earlier authorization to start implementation while retaining D1–D3 as desired future scope.

The specification is marked ready-for-agent as required by to-spec. That label does not authorize execution while D4 applies. Partial implementation remains preserved, unintegrated and unaccepted; it is not an approved interface design.

- D5 — User: “Publish tickets.” Approved publication of the proposed 16 tracer-bullet tickets with their stated blocking edges. This extends authorized documentation work to the ticket breakdown; D4 continues to prohibit implementation. The former three horizontal tickets are archived, with no work accepted or resolved.

- D6 — User: “Use $implement-spec to implement tickets in /Users/invine/src/js/clipp/.local/ui-behavior/worktrees/integration/.scratch/ui-behavior/README.md”. This explicitly authorizes implementing the published 16-ticket graph on the existing integration branch, superseding D4's execution stop. D1–D3 remain the accepted behavior and testing scope. Existing uncommitted partial work remains preserved and unaccepted until reviewed against its ticket.
