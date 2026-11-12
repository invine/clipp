# 01: Review Trust Requests on Devices

**What to build:** Let a device owner review and decide active incoming Trust Requests directly on Devices, in the context of their current Device Identity and Trusted Devices, using the agreed responsive mockup. Until the validated request sent time is available, show a truthful unavailable fallback rather than inventing one.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Owner:** implementer-01 (coordinator: Codex)

**Integration baseline:** client main `509216701bcf3c315ea9bdfc90603240790874e4`; feature branch `codex/device-trust-requests-integration` at the same commit.

**Decision assessment:** Preserves ADRs 0004–0006, signed request revalidation, and existing notification/decision semantics.

- [ ] A “Trust requests” card appears between the current Device Identity and Trusted Devices when active incoming requests exist, without an introductory paragraph; its count matches the active requests. It is hidden when the authoritative list is empty.
- [ ] Each request presents the self-reported Device Name, complete accessible Peer ID, an honest sent-time fallback, and individually named Approve and Reject controls. Multiple initiators are independently reviewable.
- [ ] Phone, tablet and desktop layouts follow the mockup's order and responsive intent, retain the existing Clipp shell and icon, support keyboard and assistive technology, and avoid horizontal page overflow. Existing device-management actions still work.
- [ ] Decisions use existing authoritative state and request-version safeguards; loading, unavailable or identity-unready state cannot be mistaken for a confirmed empty list or enable unsafe decisions. Preserve retry and recovery paths.
- [ ] Progress prevents duplicate decisions. Replacements, expiry and identity changes cannot cause a stale decision; each initiator is independent. Do not optimistically claim Admission or remove a request ahead of authoritative state.
- [ ] Failure and unconfirmed outcomes are reported truthfully, including when the final request disappears. The existing Requests destination, notification journeys and return-to-task behavior remain functional.
- [ ] Existing mounted shared UI and runtime-callback tests cover the observable request, decision, recovery and navigation behavior. Check representative layouts in a real browser and run appropriate verification, recording any unavailable native acceptance separately.
- [ ] Preserve the accepted Peer ID, signed-envelope, freshness, Admission and Membership Reconciliation contracts; do not ship mockup controls or sample data.

## Comments

Integrated as client `9cfeab1823a979dd7a9d3b6c6b596aeb6cf455a0` (source commits `22e5e8a42b69c49f8044cbf168c657071791b32f`, `9cfeab1823a979dd7a9d3b6c6b596aeb6cf455a0`). Spec/standards review identified a desktop empty-state layout regression; the fix was re-reviewed with no remaining related finding. `npm run check` passed (209 Jest suites, 1,695 tests and 133 candidate checks); focused browser tests passed 10/10, including desktop layout restoration. Two broader navigation tests failed identically on unchanged main. The three-width mockup comparison was retained as private evidence. Native acceptance was not run.

Final feature integration `a7cd1721ffdc426b0229662b8341030ff04d0f1c` was reviewed across spec and standards; `npm run verify` passed on that exact revision with local loopback access. The focused browser suite passed 12/12 after the accessibility review fix.
