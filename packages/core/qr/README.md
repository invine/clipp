# QR Module

Simple cross-platform encode/decode helpers for pairing devices via QR code.

```ts
import { encode, decode } from './index'

const uri = await encode({
  deviceId: 'peer1',
  deviceName: 'Pixel',
  multiaddr: '/ip4/1.2.3.4/tcp/9000/ws/p2p/QmPeer'
})

const payload = await decode(uri)
```
