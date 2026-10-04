# Chrome managed relay setup

Managed relay sign-in uses the extension's fixed Chrome ID. Build with
`VITE_CLIPP_REGISTERED_EXTENSION_ID` set to that ID. The relay service must
register exactly `https://<extension-id>.chromiumapp.org/clipp-relay` as its
extension callback. A temporary unpacked extension ID cannot authorize against
a service registered for a different ID. Clipp refuses to start an interactive
flow when the build input and installed ID differ.

The background service worker owns PKCE, renewable credentials and
configuration. It restricts `chrome.storage.local` to trusted contexts before
credential access. The offscreen document receives short Access Tokens over a
validated port, and popup/options receive configuration and status only. Chrome
extension storage is not an OS keychain.

Run `npm --workspace apps/extension run test:managed-relays` to build and check
the empty first-adoption configuration, popup/options message boundary,
content-script storage isolation and offscreen recreation in Chrome. The probe
does not exercise authorization or relayed transfer. Those require a running
managed relay registered for the installed extension ID and a second Clipp
device.

## Forced transport development acceptance

The `relay-acceptance` build mode selects exactly one relay-server transport and
uses the shared `relayOnly` connection gate. Device traffic must use plain relay
circuits: device direct dials, WebRTC upgrades, direct listeners, discovery and
DCUtR are disabled by that gate. Managed relay authentication, reservation and
Rendezvous still run normally. The transport selection is compiled into the
offscreen document; runtime messages and stored configuration cannot change it.
The regular build keeps its normal transport behavior and rejects an acceptance
environment variable rather than accidentally shipping an acceptance build.

From the repository root, build one candidate at a time:

```sh
CLIPP_RELAY_ACCEPTANCE_TRANSPORT=wss \
  npm --workspace apps/extension run build:relay-acceptance
CLIPP_RELAY_ACCEPTANCE_TRANSPORT=webrtc-direct \
  npm --workspace apps/extension run build:relay-acceptance
```

Output is separate from `dist`, under
`apps/extension/.local/relay-acceptance/wss` and
`apps/extension/.local/relay-acceptance/webrtc-direct`. A manual authorization run
also needs `VITE_CLIPP_REGISTERED_EXTENSION_ID` set while building. A new output
path may get a new unpacked extension ID: build success does not establish that
the ID is registered. Keep real Google authorization **NOT RUN** unless the
installed ID and the registered callback agree. Changing OAuth registration is
outside this procedure.

Run the synthetic browser fixtures with:

```sh
npm --workspace apps/extension run test:relay-acceptance
npm --workspace apps/extension run test:managed-relays
npm --workspace apps/extension run test:offscreen-storage
```

The first command builds both selections and launches each in its own temporary
Chrome profile. It checks the compiled host's direct-dial refusal, credential
canary isolation, unauthorized options control rejection, offscreen recreation,
build selection and Device Identity continuity. Profiles are removed on exit.
The other two commands check the regular build. No fixture performs Google
authorization, refreshes a real credential, reserves a live relay or transfers a
clip. Synthetic controller tests cover transport selection through the shared
controller interface; they are orchestration evidence only.

## Manual live transport and lifecycle receipt

Use a reviewed candidate in an operator-owned test profile with an already
registered extension ID, an approved managed relay and a paired second device.
Installing or updating the operator's extension is a separate review step.
The agent must not automate the installed extension's pages or a personal
profile. Keep the Device Identity and configuration in that test profile; do not
copy a profile or credential store into the fixture.

1. In the extension's options UI, configure the approved discovery endpoint,
   explicitly sign in, and wait for `ready`. Record whether the registered
   callback actually completed. Opening the portal proves no account change.
2. In options DevTools, paste the snippet below before sending a new private
   marker from the paired device. It observes existing public runtime messages
   and prints only counts and booleans. Supply the marker through the prompt;
   keep raw runtime responses, connection addresses, IDs, token storage, HTTP
   bodies and clipboard content out of exported receipts.
3. Send the marker, then call `await chromeRelayReceipt()`. Require a new Remote
   Clip, its source on a plain relay circuit, no direct device connection, a
   ready managed relay, and a relay-server connection on the selected transport.
   Separately observe clipboard application and send a different marker back
   using the popup. A successful history import alone proves no live clipboard
   application. Record both directions separately.
4. For offscreen recreation, in the **background worker's** DevTools run only
   `await chrome.offscreen.closeDocument()`, then reopen the options UI and wait
   for `ready`. Confirm identity continuity with the receipt, observe a fresh
   discovery/auth/reservation/Rendezvous sequence privately, and repeat transfer
   with a new marker. Do not export network bodies or authorization headers.
5. For worker process loss, close DevTools, close the test browser normally and
   reopen that same test profile. Repeat explicit UI observation and transfer.
   For suspension, stop the test worker using Chrome's own developer controls
   after closing attached DevTools, then wake it through the UI. Record actual
   suspension separately from a full browser restart. Check configuration and
   identity continuity; verify no old renewable credential replay or duplicate
   refresh through private operator evidence. The public receipt cannot prove
   credential rotation, save failure or transient-secret destruction.
6. Repeat with the other transport build after review. Edit and remove one relay
   while another remains ready; record the unrelated relay and Device Identity
   staying intact. Transport selection applies to both managed and explicit
   unauthenticated relay configurations. Keep each missing prerequisite or
   unobserved lifecycle/credential gate **NOT RUN**.

```js
var chromeRelayReceipt = await (async () => {
  const initial = (
    await chrome.runtime.sendMessage({ type: "getRuntimeState" })
  ).state;
  const identity = initial.identity.deviceId;
  const baseline = new Set(initial.clips.map((clip) => clip.id));
  const marker = prompt(
    "Private test marker; it will not appear in the receipt"
  );
  if (!marker) throw new Error("marker_required");
  return async () => {
    const state = (
      await chrome.runtime.sendMessage({ type: "getRuntimeState" })
    ).state;
    const host = await chrome.runtime.sendMessage({
      target: "offscreen",
      action: "getStatus",
    });
    const transport = host.relayAcceptanceTransport;
    const relays = state.managedRelayStates;
    const relayPeers = new Set(
      relays.map((relay) => relay.peerId).filter(Boolean)
    );
    const connections = state.peerConnections;
    const remote = state.clips.filter(
      (clip) =>
        !baseline.has(clip.id) &&
        clip.content === marker &&
        clip.originPeerId !== identity
    );
    const matchesTransport = (address) =>
      transport === "wss"
        ? /\/(?:wss|tls\/ws)\/p2p\//.test(address)
        : transport === "webrtc-direct" && address.includes("/webrtc-direct/");
    return {
      transport: transport ?? "default",
      identityPreserved: state.identity.deviceId === identity,
      readyManagedRelays: relays.filter(
        (relay) => relay.kind === "managed" && relay.status === "ready"
      ).length,
      selectedRelayServerConnections: connections.filter(
        (connection) =>
          relayPeers.has(connection.peerId) &&
          connection.addrs.some(matchesTransport)
      ).length,
      directDeviceConnections: connections.filter(
        (connection) =>
          !relayPeers.has(connection.peerId) && connection.hasDirect
      ).length,
      newRemoteClipObserved: remote.length > 0,
      remoteClipSourceOnPlainCircuit: remote.some((clip) =>
        connections.some(
          (connection) =>
            connection.peerId === clip.originPeerId &&
            connection.hasRelay &&
            !connection.hasDirect &&
            connection.addrs.some(
              (address) =>
                address.includes("/p2p-circuit/") &&
                !/\/webrtc(?:\/|$)/.test(address)
            )
        )
      ),
    };
  };
})();
await chromeRelayReceipt();
```

Clear the observer after recording the sanitized result with
`chromeRelayReceipt = undefined`. A default transport receipt is not forced
transport evidence. Record candidate commit, OS/Chrome version, transport, passed,
failed and not-run gates in the evidence ledger. Registered-ID Google, real
credential rotation/suspension, both live transport transfers and independent
configuration behavior remain required before completing ticket 15.
