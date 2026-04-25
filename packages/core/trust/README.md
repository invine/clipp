# Trust Manager

Manages local device identity and trusted device list.

```ts
import { createTrustManager, MemoryStorageBackend } from './index'

const trust = createTrustManager(new MemoryStorageBackend())
trust.on('approved', d => console.log('approved', d.deviceName))
```

Protocol notes:

- Trust messages are encoded in `packages/core/protocols/clipTrust.ts`.
- Trust request wire shape: `{ type: "trust-request", from, to, sentAt, payload: { device, sig } }`.
- Trust ack wire shape: `{ type: "trust-ack", from, to, sentAt, payload: { accepted, request, responder? } }`.
- `sig` is nested inside `payload` and signs the normalized unsigned request body, not a legacy top-level field layout.
