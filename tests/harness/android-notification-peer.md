# Genuine Android notification peer

This is a headless, synthetic signed protocol counterpart. It never launches Android,
changes a device route/permission, accesses clipboard, schedules an Android notification,
or admits a device. Import is inert. Root owns the separate native interval and must
bind current source, actor/guard hashes, Node version, fresh nonce/deadline, child PID,
exact loopback port and guest/reverse-mapping/isolation restoration before execution.
Source protocol tests do not qualify WebView mixed-content behavior or native delivery.

The source actor is `android-notification-peer.mjs`. Under pinned Node and the normal
TS loader its explicit entry accepts only `--nonce <16..64 ASCII nonce>` followed by
`--expires-at <absolute future Unix milliseconds, at most 10 minutes away>`.
No arguments, invalid parameters or importing the module do not start a peer.
Do not reuse a closed nonce or old evidence output. The actual native assignment and
owned process/stdio/evidence paths are the root driver's responsibility; this module
is not a root runner or a replacement for native admission.

On successful startup the actor outputs one JSON `ready` record with its PID, nonce,
deadline, synthetic public identity/name, actual port/address and normal encoded
public Pairing target. Its only real listener is IPv4 loopback WebSocket. Discovery,
TCP, WebRTC Direct, DCUtR, bootstrap, Rendezvous and relay reservations are disabled
through normal optional transport configuration. It verifies the signed address
before publishing readiness; no key or request envelope is serialized. The strict
external network guard remains installed for the entire CLI process, refusing any
non-loopback bind/connect or UDP socket before access. Guard denial fails shutdown
even if a library catches the original exception; there is no address rewrite.

Each stdin line is exactly one JSON object with only `nonce` and `action`:

- `state`: public request count, learned verified incoming peer ID, connection,
  attempted and closed flags.
- `requestIncoming`: a single reverse signed request, only after one actual verified
  incoming request established the identity and while that live connection remains.
  There is no caller-supplied target or Accept/Reject/admission command. A second
  attempt is refused, including after an unconfirmed first attempt.
- `stop`: normal complete owner stop.

Input is bounded before accumulation: 4 KiB total, 256 bytes per line, 16 commands.
Malformed/oversized input, wrong nonce or unknown action fails and stops the peer.
EOF stops it. Deadline stops it without requiring input. No force-exit hides cleanup.
A `closed` record is provisional until the owned process exits naturally with code0;
root must also bind `clean`, `guardClean` and `listenersClosed`, plus actual child
absence. Every failure remains a failure, including cleanup or timeout.

## First root-owned Android slice

Use the ordinary packaged MainActivity/AndroidApp and the existing isolated
`com.clipp.app.acceptance` package, not reset-owning acceptance or a dev origin.
`NotificationRequestsTest#genuinePeerNotificationSelectsCurrentRequestsAndBackRestoresDirtyPaste`
requires an explicit `notificationGenuinePeerAcceptance=true` and root arguments
`notificationRootNonce`, `notificationPeerId`, `notificationPeerName`,
`notificationPeerTarget` taken from this fresh actor's ready record. Root must grant
app/Pairing-channel notification availability deliberately in its native interval;
the test never changes permission or creates a synthetic notification.

Root maps only the assigned guest TCP port to the same host loopback port, preserving
existing dual-family policy and every foreign reverse mapping. Native code types the
public target, submits a genuine outgoing Trust Request, then retains a new dirty
Paste draft. Wait for both its `awaiting-genuine-reverse-request` log bound to the
nonce and the actor's actual verified incoming peer state. Only then send the nonce-
bound `requestIncoming` action. Host must not dial an invented Android endpoint or
call receive/controller/pending internals.

The test observes the actual app-owned OS notification, requires the Pairing `default`
channel, verifies arrival did not dismiss the draft, selects the real visible SystemUI
row, observes authoritative Requests with the peer's pending card, and presses native
Back to the same dirty Paste. It does not click Accept or infer membership. Root
retains separate request/display/OS selection/readiness/destination evidence. WebView
loopback eligibility and all native outcomes remain unknown until this real interval;
no mixed-content/TLS/gater/dev-origin exception may be added to force success.

The Java test closes only its owned Activity. Root must finish/verify actor shutdown,
exact mapping/isolation restoration, guest/app closure and all owned artifact/process
receipts. No failed or unavailable native observation becomes PASS from source tests.
