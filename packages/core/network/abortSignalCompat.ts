// Network queues call this method before every job, including self peer-store
// work. Older WebViews provide AbortSignal but lack throwIfAborted.
if (
  typeof AbortSignal !== "undefined" &&
  typeof AbortSignal.prototype.throwIfAborted !== "function"
) {
  const getAborted = Object.getOwnPropertyDescriptor(
    AbortSignal.prototype,
    "aborted"
  )!.get!;
  const getReason = Object.getOwnPropertyDescriptor(
    AbortSignal.prototype,
    "reason"
  )?.get;
  Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
    configurable: true,
    writable: true,
    value: function throwIfAborted(this: AbortSignal): void {
      // Use the native getter to retain AbortSignal's receiver validation.
      if (!getAborted.call(this)) return;
      if (getReason) throw getReason.call(this);
      // Hosts predating abort reasons still require a standard cancellation error.
      throw new DOMException("This operation was aborted", "AbortError");
    },
  });
}
