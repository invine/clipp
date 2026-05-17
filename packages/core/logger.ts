export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "debug";

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

function serializeLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "undefined") return "undefined";
  if (typeof arg === "bigint") return arg.toString();
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
  }

  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(arg, (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      if (typeof value === "function") {
        return `[Function ${value.name || "anonymous"}]`;
      }
      if (value && typeof value === "object") {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
    return serialized ?? String(arg);
  } catch {
    return String(arg);
  }
}

function consoleArgs(args: unknown[]): unknown[] {
  if (!isBrowserDocumentRuntime()) return args;
  return [args.map(serializeLogArg).join(" ")];
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
