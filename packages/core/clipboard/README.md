# Clipboard Service

A cross-platform clipboard watcher and writer used for synchronizing clipboard items across peers.

```
import { createPollingClipboardService } from './service'
import { createClipboardSyncManager } from '../sync/clipboardSync'

const clipboard = createPollingClipboardService({ readText, writeText, getSenderId })
const sync = createClipboardSyncManager({ clipboard, history, messaging, getLocalDeviceId })
sync.start()
```

Use `sync.setAutoSync(false)` to disable broadcasting local clips. In
environments where the service cannot read the clipboard directly (such as a
Chrome MV3 service worker), use `createManualClipboardService({ getSenderId, writeText })`
and feed clipboard contents to it via `processLocalText(text)`.
