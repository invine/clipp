---
status: accepted
---

# Store device keys in runtime application storage

The initial implementation stores each Ed25519 private key in the runtime's ordinary application storage: SQLite for Electron, Capacitor Preferences for Android, and `chrome.storage.local` for the extension. Clipp relies on operating-system and application-profile protection rather than requiring Keychain, Android Keystore, or equivalent secure-key integration in this phase, because consistent cross-runtime support—particularly in Chrome extensions—would materially increase complexity.

## Consequences

Clipp never includes the private key in logs, diagnostics, exports, protocol messages, or UI surfaces. Someone who can copy the runtime's application storage can clone that Device Identity until its Peer ID is revoked. Platform secure-key storage and migration of existing keys remain deferred security hardening rather than an initial requirement.
