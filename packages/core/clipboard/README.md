# Clipboard Service

A cross-platform clipboard watcher and writer used for synchronizing clipboard items across peers.

```
import { createClipboardService } from './service'

const service = createClipboardService('chrome', { sendClip })
service.onLocalClip(clip => console.log('local', clip))
service.onRemoteClipWritten(clip => console.log('remote', clip))
service.start()
```

Use `setAutoSync(false)` to disable sending local clips. Call `writeRemoteClip()` when receiving a clip from the network.
