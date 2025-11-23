# QR Module

Simple cross-platform encode/decode helpers for pairing devices via QR code.

```ts
import { encode, decode } from './index'

const uri = await encode({
  deviceId: 'peer1',
  deviceName: 'Pixel',
  publicKey: 'peer1-public-key',
  multiaddrs: ['/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/p2p/peer1']
})

const payload = await decode(uri)
```
