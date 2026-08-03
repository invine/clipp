# 10 — Gossip live Clips across the Device Network

**What to build:** Deliver new Clips promptly among connected Active Members across Electron, Android, and Chrome while preserving durable event identity and at-most-once local effects.

**Blocked by:** 05 — Converge Device Networks; 06 — Provide durable relay-first reachability; 07 — Capture immutable Clips across all runtimes; 08 — Enforce local history policy.

**Status:** ready-for-agent

- [ ] Live propagation uses `/clipp/clip/1.0.0` with exactly one bounded length-prefixed protobuf `LiveClip` frame per short-lived stream and no legacy fallback.
- [ ] Frames contain no payload sender, recipient, send time, hop count, or application signature; the immediate sender comes only from the authenticated libp2p connection.
- [ ] Unknown and revoked peers cannot open the live protocol, and the receiver rechecks Active membership immediately before atomic acceptance.
- [ ] The first origin send and each eligible forward exclude expired, oversized, or locally suppressed Clips and attempt delivery independently per connected Active Member.
- [ ] A received Clip is structurally and temporally validated, then atomically inserted or compared and marked `liveHandled` before clipboard, notification, or forwarding side effects.
- [ ] Exact duplicates and immutable conflicts create no second record; the first valid durable immutable record wins.
- [ ] A newly stored live Clip forwards once to other connected Active Members except the immediate sender, while a history-known Clip never gains newly-learned forwarding eligibility.
- [ ] A history-imported Clip may make one later `liveHandled` transition and one clipboard application attempt without creating another history record.
- [ ] Distinct accepted Clips serialize clipboard application in local receive order and are not collapsed or reordered by content or `capturedAt`.
- [ ] Clipboard application failure retains history and does not retry automatically; forwarding failures do not roll back storage or stop other recipient attempts.
- [ ] Before each queued side effect starts, Auto Sync, record existence, suppression, and current eligibility are rechecked.
- [ ] Malformed, oversized, stalled, or invalid live streams close only that stream, retain the authenticated connection for other protocols, and log no Clip content.
- [ ] Three-device cross-runtime tests prove gossip completion, loop suppression, restart idempotence, and independent recipient failure.
