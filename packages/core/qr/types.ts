export interface QRPayload {
  deviceId: string
  deviceName: string
  multiaddr: string
  timestamp: number
  version: "1"
}

export function isValidPayload(obj: any): obj is QRPayload {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.deviceId === "string" &&
    typeof obj.deviceName === "string" &&
    typeof obj.multiaddr === "string" &&
    typeof obj.timestamp === "number" &&
    obj.version === "1"
  )
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  return Buffer.from(b64, 'base64').toString('utf8')
}

export function payloadToBase64(payload: QRPayload): string {
  const json = JSON.stringify(payload)
  return toBase64Url(json)
}

export function base64ToPayload(b64: string): QRPayload | null {
  try {
    const json = fromBase64Url(b64)
    const obj = JSON.parse(json)
    return isValidPayload(obj) ? obj : null
  } catch {
    return null
  }
}
