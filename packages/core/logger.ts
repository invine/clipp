export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "debug";
const MAX_LOG_STRING_LENGTH = 256;
const MAX_LOG_ARRAY_LENGTH = 50;
const REDACTED_LOG_KEYS = new Set([
  "content",
  "privatekey",
  "requestenvelope",
  "rawpairingenvelope",
  "signature",
  "signedpayload",
]);

const order: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel) {
  return order[level] >= order[currentLevel];
}

function isBrowserDocumentRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function boundLogString(value: string): string {
  return value.length <= MAX_LOG_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_LOG_STRING_LENGTH)}…[truncated]`;
}

function sanitizeLogArg(
  arg: unknown,
  key?: string,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof arg === "string") {
    const normalizedKey = key?.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (normalizedKey && REDACTED_LOG_KEYS.has(normalizedKey)) return "[REDACTED]";
    return boundLogString(arg);
  }
  if (typeof arg === "undefined" || typeof arg === "number" || typeof arg === "boolean" || arg === null) {
    return arg;
  }
  if (typeof arg === "bigint") return arg.toString();
  if (typeof arg === "function") return `[Function ${arg.name || "anonymous"}]`;
  if (arg instanceof ArrayBuffer || ArrayBuffer.isView(arg)) {
    return `[binary ${arg.byteLength} bytes]`;
  }
  if (arg instanceof Error) {
    return {
      name: boundLogString(arg.name),
      message: boundLogString(arg.message),
    };
  }
  if (typeof arg !== "object") return boundLogString(String(arg));
  if (seen.has(arg)) return "[Circular]";
  seen.add(arg);
  if (Array.isArray(arg)) {
    const sanitized = arg
      .slice(0, MAX_LOG_ARRAY_LENGTH)
      .map((value) => sanitizeLogArg(value, undefined, seen));
    if (arg.length > MAX_LOG_ARRAY_LENGTH) sanitized.push(`[${arg.length - MAX_LOG_ARRAY_LENGTH} more items]`);
    seen.delete(arg);
    return sanitized;
  }
  const prototype = Object.getPrototypeOf(arg);
  if (prototype !== Object.prototype && prototype !== null) {
    const sanitized = boundLogString(String(arg));
    seen.delete(arg);
    return sanitized;
  }
  const sanitized = Object.fromEntries(
    Object.entries(arg).map(([entryKey, value]) => [
      entryKey,
      sanitizeLogArg(value, entryKey, seen),
    ]),
  );
  seen.delete(arg);
  return sanitized;
}

function serializeLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "undefined") return "undefined";
  try {
    const serialized = JSON.stringify(arg);
    return serialized ?? String(arg);
  } catch {
    return String(arg);
  }
}

function consoleArgs(args: unknown[]): unknown[] {
  const sanitized = args.map((arg) => sanitizeLogArg(arg));
  if (!isBrowserDocumentRuntime()) return sanitized;
  return [sanitized.map(serializeLogArg).join(" ")];
}

export function debug(...args: unknown[]) {
  if (shouldLog("debug")) console.debug(...consoleArgs(args));
}

export function info(...args: unknown[]) {
  if (shouldLog("info")) console.info(...consoleArgs(args));
}

export function warn(...args: unknown[]) {
  if (shouldLog("warn")) console.warn(...consoleArgs(args));
}

export function error(...args: unknown[]) {
  if (shouldLog("error")) console.error(...consoleArgs(args));
}
