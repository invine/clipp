# Ticket 10 Pairing counterpart route — 2026-11-02

Status: accepted by direct user instruction
Scope: Ticket 10 / G01 Android and Chrome native Pairing counterpart mapping

## Decision evidence

The user directed: “In this case, remove android to extension mapping from the acceptance gates, it's not a valid test cases. Proceed with other gates”. The current Android Capacitor app runs in a WebView without an inbound LAN listener, and the Chrome extension cannot listen for incoming Pairing. The Android-to-Chrome mapping is therefore excluded for this candidate and environment; its failure is not a product Pairing failure or a passed gate.

## Accepted mapping

Keep the per-runtime native Pairing qualification, using Electron as the counterpart in separate journeys:

- Android initiates Pairing to an isolated Electron acceptance app.
- Chrome extension initiates Pairing to an isolated Electron acceptance app.

Each journey must use its own fresh isolated identity/profile, guarded synthetic clipboard values, and a route permitted by normal transport policy. Neither journey supplies evidence for the other runtime. Continue to require request/wait, rejection then fresh valid acceptance, authoritative durable Membership, retained draft/dismissal behavior, cold reopen where assigned, and synthetic exchange where the owning G01 runner requires it.

This decision removes only Android-to-Chrome as a counterpart mapping. It does not weaken security or routing policy, count a failed attempt as a pass, resolve Ticket 10, close C07/G01, alter broader G31 exchange coverage, or change any external/retained disposition.
