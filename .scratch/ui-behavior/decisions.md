# Accepted decisions

- D1 — User, 2026-11-03: “I want to implement both.” Accepted: shared reducer-backed UI behavior and runtime-to-UI adaptation across Electron, Android and extension. Covers R1–R4.
- D2 — User, 2026-11-03: “q1 yes q2 yes.” Accepted: production reducer/effect runner exercised with scripted runtime stubs, automated mounted UI tests and interactive browser scenario harness. Covers R5–R7. Confirms shared understanding from architecture/grilling discussion.
- D3 — Existing ADRs 0006, 0010, 0011 and 0012 remain accepted. UI state never manufactures Admission, changes Clip event identity, applies reconciled history to clipboard, or changes retained Relay Session policy. Covers R8.

Implementation choices preserve existing behavior and runtime authority. No new product/domain concept or protocol is introduced.
