import QRCode from 'qrcode'
import { QRPayload, payloadToBase64 } from './types'

export async function encode(
  identity: Omit<QRPayload, 'timestamp' | 'version'>
): Promise<string> {
  const payload: QRPayload = {
    ...identity,
    timestamp: Math.floor(Date.now() / 1000),
    version: '1'
  }
  const b64 = payloadToBase64(payload)
  return await QRCode.toDataURL(b64, { errorCorrectionLevel: 'L', margin: 0, scale: 2 })
}
