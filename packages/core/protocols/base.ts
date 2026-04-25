export type ProtocolMessage<TType extends string, TPayload> = {
  type: TType;
  from: string;
  sentAt: number;
  payload: TPayload;
};

export type DirectedProtocolMessage<TType extends string, TPayload> =
  ProtocolMessage<TType, TPayload> & {
    to: string;
  };

export function encodeJsonMessage(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function decodeJsonMessage(data: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object";
}

export function resolveSentAt(value: unknown, now: () => number = Date.now): number {
  return typeof value === "number" ? value : now();
}
