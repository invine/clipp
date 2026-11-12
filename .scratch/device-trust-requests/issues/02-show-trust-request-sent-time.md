# 02: Show when a Trust Request was sent

**What to build:** Let a device owner see when each incoming Trust Request was sent in the Devices card, using the validated timestamp already present in the signed request across the supported runtimes.

**Blocked by:** 01: Review Trust Requests on Devices.

**Status:** resolved

**Owner:** implementer-02 (coordinator: Codex)

**Integration baseline:** client `9cfeab1823a979dd7a9d3b6c6b596aeb6cf455a0`.

**Decision assessment:** Preserves ADRs 0004–0006 and signed `issuedAt` validation; projects validated metadata only, with no protocol change.

- [ ] The Devices card displays each request's correctly labeled, localized and unambiguous sent date and time from its validated signed `issuedAt`, replacing the temporary unavailable fallback when the value can be represented.
- [ ] The request time is exposed through the affected shared projections and Electron, Chrome extension and Android runtime bridges. Existing request versions, identity scoping, coalescing and decision safeguards remain intact.
- [ ] An unavailable or unrepresentable timestamp has a truthful accessible fallback; expiry, receipt time and sample data are never substituted for the sent time. Full-width integer validation and signed-envelope handling remain unchanged.
- [ ] Mounted shared UI tests exercise real observable timestamp presentation and fallback. Targeted tests at existing projection and bridge seams cover each affected runtime and boundary values, including replacement requests with different sent times.
- [ ] Appropriate verification passes and runtime/native acceptance is recorded where applicable; no Pairing protocol or authorization changes are introduced.

## Comments

Integrated on client branch `codex/device-trust-requests-integration` as `6a5d2889ebafe969eab184b8774492a2123cf01d`; final review fix `a7cd1721ffdc426b0229662b8341030ff04d0f1c` disambiguates same-named devices for assistive technology and consolidates request feedback. Spec and standards reviewers rechecked their findings and found them resolved. On final integration `a7cd1721ffdc426b0229662b8341030ff04d0f1c`, `npm run verify` passed with local loopback access: 212 Jest suites / 1,703 tests, 133 candidate fixtures, typechecks, lint and Electron, Android and extension production builds. Focused request browser suite passed 12/12; direct runtime projection tests passed across all three runtimes. An initial sandboxed integration run failed on prohibited loopback listeners; the authorized rerun passed. Two unrelated broader navigation tests failed identically on baseline main. Native device acceptance and live relay transfers were not run.
