# 03 — Open Pairing with a durable Trust Request

**What to build:** Let a user import a Pairing Target, immediately send a valid signed Trust Request, and let the target review a durable, coalesced approval through its native notification and in-app approval surface.

**Blocked by:** 02 — Initialize Device Identities across all runtimes.

**Status:** resolved

- [x] All runtimes generate and accept only Pairing Target version 2 using bounded protobuf bytes, unpadded Base64URL, and the `clipp:pair:` prefix.
- [x] Pairing Targets contain the canonical target Peer ID and original Signed Peer Record envelope, may contain an untrusted Device Name hint, and contain no membership authority, secret, raw address list, separate public key, or application expiry.
- [x] Import verifies the Signed Peer Record against the target Peer ID, imports verified reachability, dials the named identity, and immediately sends a request without another initiator confirmation.
- [x] Trust Requests use one bounded length-prefixed protobuf frame on `/clipp/pairing/1.0.0`, bind both canonical Peer IDs, Device Name and revision, and precise `issuedAt`, and are signed over the original domain-separated payload bytes.
- [x] The production validity window defaults to 10 minutes and clock-skew allowance to two minutes; both are injectable and cannot be selected by the request or edited as user preferences.
- [x] A successfully sent request creates an independent, non-persistent `Waiting for approval` state per target; rescanning explicitly sends a fresh request and replaces that target's deadline.
- [x] The target persists the original valid request envelope per initiator, coalesces newer requests from that initiator, and allows different initiators to remain pending independently.
- [x] A valid unknown initiator produces one native notification without an unsolicited application pop-up; selecting it opens an in-app approval view showing the Device Name and full Peer ID.
- [x] Pending requests and valid notifications survive restart, while expired pending records are deleted and their notifications dismissed.
- [x] Malformed, oversized, incorrectly signed, premature, expired, wrongly targeted, or identity-mismatched requests create no approval or response and produce privacy-limited, rate-limited rejection diagnostics.
