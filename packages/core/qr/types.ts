export interface QRPayload {
  deviceId: string
  deviceName: string
  multiaddr?: string
  multiaddrs: string[]
  publicKey?: string
  timestamp: number
  version: "1"
}

export function isValidPayload(obj: any): obj is QRPayload {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.deviceId === "string" &&
    typeof obj.deviceName === "string" &&
    Array.isArray(obj.multiaddrs) &&
    obj.multiaddrs.length > 0 &&
    obj.multiaddrs.every((m: any) => typeof m === "string") &&
    typeof obj.timestamp === "number" &&
    obj.version === "1"
  )
}

function normalizeBase64(b64url: string): string {
  return b64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=')
}

function utf8ToBytes(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value)
  }
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, 'utf8'))
  }
  throw new Error('UTF-8 encoding is unavailable')
}

function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes)
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString('utf8')
  }
  throw new Error('UTF-8 decoding is unavailable')
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize))
  }
  if (typeof btoa !== "function") {
    throw new Error('Base64 encoding is unavailable')
  }
  return btoa(binary)
}

function base64ToBytes(b64url: string): Uint8Array {
  const b64 = b64url
    ? normalizeBase64(b64url)
    : ''
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(b64, 'base64'))
  }
  if (typeof atob !== "function") {
    throw new Error('Base64 decoding is unavailable')
  }
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function payloadToBase64(payload: QRPayload): string {
  const json = JSON.stringify(payload)
  return bytesToBase64(utf8ToBytes(json))
}

export function base64ToPayload(b64: string): QRPayload | null {
  try {
    const json = bytesToUtf8(base64ToBytes(b64))
    const obj = JSON.parse(json)
    return isValidPayload(obj) ? obj : null
  } catch {
    return null
  }
}
