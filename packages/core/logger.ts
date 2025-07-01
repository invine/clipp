export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";

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

export function debug(...args: unknown[]) {
  if (shouldLog("debug")) console.debug(...args);
}

export function info(...args: unknown[]) {
  if (shouldLog("info")) console.info(...args);
}

export function warn(...args: unknown[]) {
  if (shouldLog("warn")) console.warn(...args);
}

export function error(...args: unknown[]) {
  if (shouldLog("error")) console.error(...args);
}
