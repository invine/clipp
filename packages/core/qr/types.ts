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

export function payloadToBase64(payload: QRPayload): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json, 'utf8').toString('base64url')
}

export function base64ToPayload(b64: string): QRPayload | null {
  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8')
    const obj = JSON.parse(json)
    return isValidPayload(obj) ? obj : null
  } catch {
    return null
  }
}
