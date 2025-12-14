jest.mock("../../../packages/core/trust/identity", () => {
  const KEY = "localDeviceIdentity";
  return {
    async getLocalIdentity(storage: any) {
      const existing = await storage.get(KEY);
      if (existing) return existing;
      const created = {
        deviceId: "me",
        deviceName: "Test",
        publicKey: "pk",
        privateKey: "sk",
        multiaddr: "/p2p/me",
        multiaddrs: ["/p2p/me"],
        createdAt: Date.now(),
      };
      await storage.set(KEY, created);
      return created;
    },
    async setLocalIdentityName(storage: any, deviceName: string) {
      const id = await storage.get(KEY);
      const updated = { ...(id || {}), deviceName };
      await storage.set(KEY, updated);
      return updated;
    },
  };
});

import { createTrustManager, MemoryStorageBackend, TrustedDevice } from '../../../packages/core/trust'

const backend = new MemoryStorageBackend()
const trust = createTrustManager(backend)

function sample(id: string): TrustedDevice {
  return {
    deviceId: id,
    deviceName: 'Test',
    publicKey: 'pk',
    multiaddr: `/p2p/${id}`,
    multiaddrs: [`/p2p/${id}`],
    createdAt: Date.now(),
  }
}

describe('TrustManager', () => {
  it('identity persists', async () => {
    const id1 = await trust.getLocalIdentity()
    const id2 = await trust.getLocalIdentity()
    expect(id1.deviceId).toBe(id2.deviceId)
  })

  it('add & list', async () => {
    await trust.add(sample('d1'))
    expect(await trust.isTrusted('d1')).toBe(true)
    const list = await trust.list()
    expect(list.length).toBe(1)
  })

  it('handleTrustRequest emits once', async () => {
    const req = sample('d2')
    const calls: TrustedDevice[] = []
    trust.on('request', d => calls.push(d))
    await trust.handleTrustRequest(req)
    await trust.handleTrustRequest(req)
    expect(calls.length).toBe(1)
  })

  it('approval flow emits approved', async () => {
    const dev = sample('d3')
    const events: TrustedDevice[] = []
    trust.on('approved', d => events.push(d))
    await trust.add(dev)
    expect(events[0].deviceId).toBe('d3')
    const list = await trust.list()
    expect(list.some(d => d.deviceId === 'd3')).toBe(true)
  })

  it('auto-expire', async () => {
    jest.useFakeTimers()
    const req = sample('d4')
    const events: TrustedDevice[] = []
    trust.on('rejected', d => events.push(d))
    await trust.handleTrustRequest(req)
    jest.advanceTimersByTime(11 * 60 * 1000)
    expect(events[0].deviceId).toBe('d4')
    jest.useRealTimers()
  })

  it('verifyPublicKey works', async () => {
    const dev = sample('d5')
    await trust.add(dev)
    expect(await trust.verifyPublicKey('d5', 'pk')).toBe(true)
    expect(await trust.verifyPublicKey('d5', 'bad')).toBe(false)
  })
})
