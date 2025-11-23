import { encode, decode } from '../../../packages/core/qr/index'
import { payloadToBase64 } from '../../../packages/core/qr/types'

const sample = {
  deviceId: 'dev-123',
  deviceName: 'Pixel 8',
  multiaddrs: ['/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/p2p/dev-123'],
  publicKey: 'pubkey-abc',
}

describe('qr encode/decode', () => {
  const now = 1_600_000_000
  let spy: jest.SpyInstance
  beforeAll(() => {
    spy = jest.spyOn(Date, 'now').mockReturnValue(now * 1000)
  })
  afterAll(() => {
    spy.mockRestore()
  })

  it('round trip', async () => {
    const uri = await encode(sample)
    expect(uri.startsWith('data:image/')).toBe(true)
    const b64 = payloadToBase64({ ...sample, timestamp: now, version: '1' })
    const payload = await decode(b64)
    expect(payload).toEqual({ ...sample, timestamp: now, version: '1' })
  })

  it('rejects expired', async () => {
    const b64 = payloadToBase64({ ...sample, timestamp: now - 1000, version: '1' })
    await expect(decode(b64)).resolves.toBeNull()
  })

  it('malformed base64', async () => {
    await expect(decode('%%%BAD%%%')).resolves.toBeNull()
  })

  it('unicode device name', async () => {
    const b64 = payloadToBase64({ ...sample, deviceName: 'Мой 📱', timestamp: now, version: '1' })
    const res = await decode(b64)
    expect(res?.deviceName).toBe('Мой 📱')
  })

  it('size budget', async () => {
    const uri = await encode(sample)
    expect(uri.length).toBeLessThan(4096)
  })
})
