import { QRPayload, base64ToPayload } from './types'

export async function decode(raw: string): Promise<QRPayload | null> {
  const b64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
  const payload = base64ToPayload(b64)
  if (!payload) return null
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - payload.timestamp) > 300) return null
  return payload
}
