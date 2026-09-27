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
