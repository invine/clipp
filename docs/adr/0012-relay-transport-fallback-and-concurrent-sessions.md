---
status: accepted
---

# Retain one relay connection and try alternative transports on failure

Clipp must try the supported transports advertised by each Relay Configuration before declaring a transport connection failure. The user clarified on 2026-10-05 that this does not request persistent concurrent connections to the same Relay Instance. On 2026-10-05 the user accepted one retained authenticated Relay Session per configuration, with bounded attempts through alternatives when establishment fails or the selected connection is lost, and requested lower overhead transports first. Persistent concurrency requires a separate decision.

## Requirement and terminology

- A **transport attempt** tries an advertised TCP, WSS or WebRTC Direct route. Runtime support determines which routes are eligible.
- A **Relay Session** is an authenticated physical connection, as defined in `clipp-relay/GLOSSARY.md`. Each physical session consumes an account and global session slot under the current quota contract.
- A **Relayed Connection** carries application traffic between Device Identities through a relay. Opening several sessions to the relay does not itself duplicate a Clip, combine their bandwidth or migrate an existing application stream.
- Trying alternative transports during establishment and retaining several authenticated sessions are separate policies. Short-lived dial attempts may overlap within existing bounds without making persistent concurrency the default.
- Different configured relays remain independent. This decision concerns transport selection within one configuration, not selecting only one relay from the configuration list.

## Considered options

| Policy                                                      | Benefits                                                                                                                                                                       | Costs and limits                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One retained session, fallback through alternatives         | Meets the clarified requirement; preserves current session accounting and same-Peer-ID replacement; smaller renewal, retry and cleanup state; lower idle resource use expected | A failed transport can add its bounded timeout to establishment; after loss, the alternative must dial/authenticate and restore relay services                                       |
| Bounded overlapping attempts, one retained session          | Can reduce delay from an unreachable preferred route; preserves a single steady-state session                                                                                  | More temporary sockets/handshakes; careful cancellation and authenticated ownership are required; the first socket to connect is not necessarily a usable relay                      |
| One active session plus a persistent authenticated standby  | Can avoid a new transport/authentication handshake after an individual transport fails                                                                                         | Usually two session slots per installation; ongoing renewal/keepalive work; reservation/Rendezvous promotion and broken circuits still need repair                                   |
| Persistent authenticated sessions on every supported family | Warm alternatives and visibility of individual transport reachability                                                                                                          | Up to three slots for Electron and two for Android/extension per relay; greatest lifecycle and admission complexity; no demonstrated need for this cost in the clarified requirement |

Persistent alternatives can reduce recovery time **if** the other connection is healthy. They share the same Relay Instance, account, discovery endpoint and often infrastructure, so they do not protect against a relay process outage, account suspension, exhausted quota or every common network failure. Existing application streams are not automatically transferred to another session.

## Implications of persistent concurrency

### Quotas and capacity

Under the existing physical-session definition, one Electron installation using TCP, WSS and WebRTC Direct consumes three slots instead of one. One Android installation and one extension each consume two when both supported families connect. Together these three installations consume seven slots rather than three. With a five-session account limit, some extra families would be refused even though three single-session installations could all connect.

This is arithmetic from the current admission contract, not a capacity measurement. Counting one Device Identity instead of each physical connection would change Relay Quota semantics and require another explicit decision; it cannot be introduced as a transport optimization. Capacity ticket 33 remains deferred.

### Resource use and traffic

Additional connections add socket/native transport state, authentication, renewal and retry work. More background work may affect mobile power use; no battery, memory or CPU multiplier has been measured. The candidate still uses one stock reservation/Rendezvous owner per relay Peer ID, so three sessions do not mean three independent incoming relay paths or three copies of application payload.

### Ownership, authorization and compatibility

Each physical connection must independently verify the expected Relay Instance Peer ID before credentials, cross the Relay Authentication Barrier, expire/renew correctly and close on revocation. Same-family replacement, cross-account replacement, late callbacks and aggregate UI state require additional rules when several sessions coexist.

The original service contract replaces the prior authenticated same-Peer-ID session. Persistent concurrency therefore needs coordinated client **and** relay changes. A concurrent client pointed at an old relay can replace its own sessions repeatedly; deployment compatibility cannot be inferred from a successful local fixture.

The installed stock JS Circuit Relay reservation store is keyed by Peer ID and records one owning connection. Concurrent authenticated connections need explicit promotion and lease cleanup coordination around that model. Circuit Relay itself uses reservations and an active target connection; see the [Circuit Relay v2 specification](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md). Warm connections do not establish transparent failover for existing circuits.

## Decision

Retain one usable authenticated connection for each Relay Configuration. Give every eligible transport family a bounded opportunity before reporting transport failure, including when an earlier route establishes a socket but then fails during transport-local relay setup. On actual connection loss, repeat selection through the alternatives. Keep a healthy selected connection rather than continuously opening other families.

Transport failure and policy refusal must remain distinct:

- Network timeout, handshake failure or another transport-local setup failure advances to an eligible alternative. A wrong Peer ID rejects that route before sending credentials.
- Invalid discovery/configuration and unsupported routes retain their explicit errors.
- Authentication rejection, quota/session refusal and authoritative retry hints keep their existing login/refusal/backoff semantics. Trying another transport must not bypass account policy or repeatedly launch a browser.
- Failed renewal retains an existing session until its original expiry, as required by the service contract. Rendezvous degradation keeps its documented repair behavior rather than treating every service error as evidence of a broken transport.

Dialing bounds must allow the eligible families to be reached; an early black-hole route or repeatedly selected unusable socket must not starve later families. The exact scheduling and timeout allocation need TDD at the approved controller/host seams, with one effective session after success and complete cleanup on stop/removal.

This decision preserves the original same-Peer-ID admission contract. Persistent warm standby or all-family retention remains an option to revisit with measured recovery benefits, idle costs, quota implications and lifecycle evidence.

## Transport preference

Use TCP → WSS → WebRTC Direct on Electron. Android and the extension currently use browser/WebView transports, so use WSS → WebRTC Direct there. Prefer lower framing and setup complexity among the transports actually supported by that runtime. Raw TCP still receives the existing libp2p security and authentication layers; this choice does not remove encryption.

TCP avoids the additional WebSocket/TLS encapsulation. WSS is the simpler browser-supported setup compared with WebRTC Direct's ICE/DTLS/SCTP and Peer Identity handshake. This is a structural overhead heuristic, not measured CPU, battery, throughput or latency superiority: WebRTC may perform better on some networks. See the [WebRTC Direct specification](https://github.com/libp2p/specs/blob/master/webrtc/webrtc-direct.md) and [WebSocket specification](https://github.com/libp2p/specs/blob/master/websockets/README.md).

A blocked or transport-locally unusable preferred route advances to alternatives within bounded attempts. Runtime acceptance can still force one supported family to prove its actual path. Once a connection is healthy, keep it; do not disrupt it merely because a higher-priority transport becomes available.

## Evidence and implementation disposition

The pre-concurrency Clipp controller at `babc3c9` races verified **dials**, then authenticates/reserves/registers the chosen connection outside that race. This proves that merely retaining the old dial loop is insufficient evidence for fallback after later transport-local setup failures: selection must be tested through the usable relay boundary.

The concurrent candidate proves simultaneous TCP/WSS/WebRTC Direct connections, two opaque transfers around owner loss, promotion and recovery in local real Go/JS fixtures. It also has unresolved cleanup/retry review and verification findings. Some findings concern shared pre-existing retry/lifecycle logic; they are not evidence that every defect was caused by concurrency. Happy-path interop does not establish production resource cost or complete runtime acceptance.

The coordinator had already integrated candidate code into local main branches before this clarification: Clipp `8eee176`, relay `fe4644b`. It was **not deployed**. Both snapshots are preserved as `codex/managed-relay-concurrency-candidate-20261005`; additional client commits and uncommitted changes remain in the isolated implementation worktree. The user accepted fallback on 2026-10-05. Local main was reconciled and verified on 2026-10-05; the candidate branches remain historical experiments.

Reconcile local main to this accepted policy while preserving the candidate branches. Remove the concurrency-specific client/server behavior, retain unrelated runtime/acceptance work, and implement/test complete transport fallback from the single-session baseline. Independently useful retry/cleanup corrections require their own completed tests and review before reuse. Do not resolve tickets 34/35 from the concurrency candidate or push, publish or deploy as part of this decision.

## Acceptance evidence

- Preferred transport cannot dial, later supported transport succeeds.
- Preferred route verifies the relay Peer ID but has a transport-local setup failure; a later transport succeeds without credential disclosure to the wrong peer.
- Every supported family fails: each received a bounded attempt and the final state reports failure without leaked candidates or sessions.
- Success retains exactly one effective authenticated connection per configuration; other relays and direct peers remain connected.
- Selected connection loss recovers through an alternative; policy refusals and retry hints remain enforced.
- Removal/stop and late callbacks complete owned cleanup; real runtime tests distinguish the selected relay path from direct transfer.

## Implementation result — 2026-10-05

Local client main `c514e9e` and relay main `a29f581` implement this decision.
Independent Standards/Spec findings were corrected, including initial Rendezvous
lifetime tracking, SNI eligibility and independent authentication/Rendezvous retry
ownership. Canonical checks passed 74 suites/627 tests, all three runtime builds,
Go vet/full race, and real TCP/WSS/WebRTC Direct fallback transfers retaining one
relay connection per device. Ticket 34 is resolved; runtime/live qualification
remains separate. Candidate branches and existing uncommitted work are preserved.
No push, publication or deployment occurred.
