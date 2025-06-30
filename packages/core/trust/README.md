# Trust Manager

Manages local device identity and trusted device list.

```ts
import { createTrustManager, MemoryStorageBackend } from './index'

const trust = createTrustManager(new MemoryStorageBackend())
trust.on('approved', d => console.log('approved', d.deviceName))
```
